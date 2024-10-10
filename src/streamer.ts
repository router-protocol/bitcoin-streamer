const Client = require('bitcoin-core');
import { initializeMongoDB, getCollection, closeMongoDBConnection } from './db/mongoDB';
import { Collection, Document } from 'mongodb';
import { updateLastUpdatedBlock, getLastSyncedBlock } from './db/mongoDB/action/chainState';
import logger from './logger';
import { getNetwork } from "./constant/index";
import { ChainGrpcMultiChainApi, getEndpointsForNetwork, getNetworkType } from '@routerprotocol/router-chain-sdk-ts';
import NodeCache from 'node-cache';
import pLimit from 'p-limit';
require('dotenv').config();


// Initialize the cache
const cache = new NodeCache({ stdTTL: 300, checkperiod: 320 }); // Cache TTL is 5 minutes

const limit = pLimit(20); // Limit to 5 concurrent requests

const sslEnabled = process.env.BITCOIN_RPC_SSL === 'true';

export const bitcoinClient = new Client({
  network: 'mainnet',
  username: process.env.BITCOIN_RPC_USER,
  password: process.env.BITCOIN_RPC_PASSWORD,
  host: process.env.BITCOIN_RPC_HOST, 
  port: process.env.BITCOIN_RPC_PORT,
  ssl: sslEnabled,
});

const ISendFlag = 0xED; 
const IReceiveFlag = 0xEA; 
const SetDappMetadataFlag = 0xDA;

const   flagSize         = 1
const	destAmountSize   = 8
const	sourceAmountSize = 8
const   partnerIdSize    = 8
const	depositIDSize 	 = 8
const	feePayerSize    = 20
const	destChainIdSize  = 1
const	srcChainIDSize = 32 
const	recipientSizeEVM = 20 
const	evmDestChainIdSize  = 32



interface ExtractedBitcoinData {
    EventType: string;
    TxHash: string;
    OpReturnData: string;
    SourceAmount: bigint;
    DestChainId: string;
    DepositId: bigint;
    PartnerId: bigint;
    Recipient: string;
    BlockHeight: number;
    BlockTimestamp: number;
    SrcChainId: string;
    Gateway: string;
    RequestIdentifier: bigint;
    Depositor: string;
    DestAmount: bigint;
    GasBurnt: bigint;
    FeePayerAddress: string;
}

let gatewayAddress : string;

export async function initialize() {
    logger.info('Starting MongoDB initialization');

    await initializeMongoDB();

    logger.info(`CHAIN_ID: ${process.env.CHAIN_ID}`);
    const network = getNetwork(process.env.CHAIN_ID);
    logger.info(`Streamer Service Running on : ${network.name}`);

    const chainStateCollection = await getCollection('chainState');
    const EXPLORER_ENVIRONMENT: string = process.env.EXPLORER_ENVIRONMENT;
    const endpoint = getEndpointsForNetwork(getNetworkType(EXPLORER_ENVIRONMENT.toLowerCase())).grpcEndpoint;

    logger.info('Creating multi-client instance', endpoint);
    const multiClientClient = new ChainGrpcMultiChainApi(endpoint);
    const contractConfigs = await multiClientClient.fetchAllContractConfig();

    logger.info('Fetching gateway configuration');
    const gatewayConfig = contractConfigs.contractconfigList.find(e => e.chainid == network.id && e.contracttype == 0 && e.contractEnabled);
    if (!gatewayConfig) throw new Error('Gateway contract configuration not fetched from chain.');

    gatewayAddress = gatewayConfig.contractaddress

    let currentBlock = await determineStartBlock(chainStateCollection, network.startBlock ? network.startBlock : undefined);
    
    while (true) {

        const latestBlockNumber = await bitcoinClient.getBlockCount();
        logger.info(`Latest Block Number: ${latestBlockNumber}`);

        if (currentBlock > latestBlockNumber) {
        logger.info(`Current processing block ${currentBlock} is > latest confirmed block ${latestBlockNumber}. Pausing for 5 minutes`);
        await new Promise(resolve => setTimeout(resolve, 300000));
        continue;
        }

        logger.info(`Starting to process transactions for block ${currentBlock}`);
        await processBlock(currentBlock);

        // Update the last processed block in the database
        await updateLastUpdatedBlock(chainStateCollection, currentBlock);

        // Move to the next block
        currentBlock++;
    }
}

async function processBlock(blockNumber: number) {  
  try {
    const blockHash = await bitcoinClient.getBlockHash(blockNumber);
    const block = await bitcoinClient.getBlock(blockHash);
    await processTransactionsInChunks(block,Number(process.env.CHUNK_SIZE)); 
  } catch (error) {
    logger.error(`Error processing block ${blockNumber}: ${error.message}`);
    throw error; // Optionally rethrow or handle the error as needed
  }
}


async function processTransactionsInChunks(block: any, chunkSize: number) {
  const txids = block.tx;
  const totalTxs = txids.length;
  logger.info(`Block ${block.height} contains ${totalTxs} transactions`);

  for (let i = 0; i < totalTxs; i += chunkSize) {
      const chunk = txids.slice(i, i + chunkSize);
      logger.info(`Processing transactions ${i + 1} to ${Math.min(i + chunkSize, totalTxs)} of block ${block.height}`);

      await Promise.all(chunk.map(txid => limit(() => retryWithBackoff(() => processTransactionWithCache(block, txid), 3))));
  }
}

async function processTransactionWithCache(block: any, txid: string) {
  try {
      const transaction = await getTransactionWithCache(txid);
      await processTransaction(block, transaction);
  } catch (error) {
      logger.error(`Error processing transaction ${txid}: ${error.message}`);
  }
}

async function getTransactionWithCache(txid: string) {
  const cacheKey = `tx:${txid}`;
  let transaction = cache.get(cacheKey);
  
  if (!transaction) {
      transaction = await retryWithBackoff(() => bitcoinClient.getRawTransaction(txid, true), 3);
      cache.set(cacheKey, transaction, 300); // Cache for 5 minutes
  }
  
  return transaction;
}

async function retryWithBackoff(fn: () => Promise<any>, retries: number) {
  let attempt = 0;
  let delay = 1000;

  while (attempt < retries) {
      try {
          return await fn();
      } catch (error) {
          if (attempt < retries - 1) {
              logger.warn(`Attempt ${attempt + 1} failed: ${error.message}. Retrying after ${delay}ms.`);
              await new Promise(resolve => setTimeout(resolve, delay));
              delay *= 2;
              attempt++;
          } else {
              logger.error(`All ${retries} attempts failed: ${error.message}`);
              throw error;
          }
      }
  }
}

async function processTransaction(block : any, transaction: any) {
    
    let actualData: Buffer | undefined;
    
    try {
        // Iterate over the Vout to find OP_RETURN and decode the memo
        for (const vout of transaction.vout) {
            if (vout.scriptPubKey.type === "nulldata" && vout.scriptPubKey.hex) {
                const encodedData = Buffer.from(vout.scriptPubKey.hex, 'hex');

                if (encodedData.length === 0) continue;

                // Skip the first byte(s) that represent the OP_RETURN and length
                actualData = encodedData.subarray(1); // Omits the first byte
                if (encodedData.length > 1 && encodedData[0] === 0x6a) {
                    actualData = encodedData.subarray(2); // Omits the length byte as well
                }

                if (actualData.length === 0) continue;

                const flag = actualData[0];

                if (flag === ISendFlag || flag === IReceiveFlag || flag === SetDappMetadataFlag) {
                    
                    logger.info(`Found a valid flag: ${flag}`);
                    await extractDataFromRPCTransaction(transaction,block,actualData);
                }
            }
        }

    } catch (error) {
        logger.error(`Error processing transaction ${transaction.txid}: ${error.message}`);
    }
}

async function extractDataFromRPCTransaction(tx: any, block: any, actualData: Buffer){
  const extractedData: ExtractedBitcoinData = {
    EventType:'',
    TxHash: tx.txid,
    OpReturnData: actualData.toString('hex'), // Assuming this is the data from OP_RETURN
    SourceAmount: BigInt(0),
    DestChainId: '',
    DepositId: BigInt(0),
    PartnerId: BigInt(0),
    Recipient:'',
    BlockHeight: block.height,
    BlockTimestamp: block.time,
    SrcChainId: '',
    Gateway: gatewayAddress,
    RequestIdentifier: BigInt(0),
    Depositor: '',
    DestAmount: BigInt(0),
    GasBurnt: BigInt(0),
    FeePayerAddress: '',
  };

  logger.info(`Extracting Data from transaction with hash: ${tx.txid}`);

  // Get the transaction index in the block
  const txIndex = block.tx.findIndex((txID: string) => txID === tx.txid);
  if (txIndex === -1) throw new Error(`Transaction ${tx.txid} not found in block`);

  // Use BigInt for large integer operations
  const blockHeightBigInt = BigInt(extractedData.BlockHeight);
  extractedData.DepositId = (blockHeightBigInt << BigInt(32)) | BigInt(txIndex);

  const gasBurnt = await fetchTransactionFee(tx);
  extractedData.GasBurnt = gasBurnt;

  let depositorAddress = '';

  // Extract depositor address
  if (tx.vin.length > 0 && tx.vin[0].txid) {
    const prevTxHash = tx.vin[0].txid;
    const prevTx = await bitcoinClient.getRawTransaction(prevTxHash, true);

    if (prevTx.vout.length > tx.vin[0].vout) {
      const vout = prevTx.vout[tx.vin[0].vout];

      if (vout.scriptPubKey.addresses && vout.scriptPubKey.addresses.length > 0) {
        depositorAddress = vout.scriptPubKey.addresses[0];
      } else if (vout.scriptPubKey.address) {
        depositorAddress = vout.scriptPubKey.address;
      } else {
        throw new Error(`No valid depositor address found for transaction: ${tx.txid}`);
      }
    } else {
      throw new Error(`Vout index ${tx.vin[0].vout} out of range for transaction: ${tx.txid}`);
    }
  } else {
    throw new Error(`Invalid Vin structure or empty Txid for transaction: ${tx.txid}`);
  }

  extractedData.Depositor = depositorAddress;

  if (actualData.length === 0) {
    throw new Error(`No MEMO found in transaction: ${extractedData.TxHash}`);
  }

  const flag = actualData[0];
  const eventData = actualData.subarray(1);

  switch (flag) {
    case ISendFlag:
      
      await processISendEvent(tx, extractedData, eventData, depositorAddress, gatewayAddress);
      break
      
    case IReceiveFlag:
      
      await processIReceiveEvent(tx, extractedData, eventData, gatewayAddress);
      break

    case SetDappMetadataFlag:
        
      await processSetDappMetadataEvent(tx, extractedData, eventData, depositorAddress);
      break

    default:
      throw new Error(`Unknown event: ${flag}`);
  }
}

///////////////////////////////////////////////////////////////////////////////////////////
////////////////////////// ISEND EVENT ////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////
async function processISendEvent(
    tx: any,
    extractedData: ExtractedBitcoinData,
    eventData: Buffer,
    depositorAddress: string,
    gatewayAddress: string
  ) {
  
    if (depositorAddress === gatewayAddress) {
      throw new Error(`The Depositor Address is same as Gateway address: ${depositorAddress}`);
    }
  
    let totalReceived = BigInt(0);
  
    // Loop through the outputs to find the amount sent to the btcGatewayAddress
    logger.info(`Starting to process Vout for transaction: ${tx.txid}`);
    for (const [i, output] of tx.vout.entries()) {
      logger.info(`Processing output ${i}: Value=${output.value}, ScriptPubKey=${JSON.stringify(output.scriptPubKey)}`);
      let address: string | undefined;
      if (output.scriptPubKey.addresses && output.scriptPubKey.addresses.length > 0) {
        address = output.scriptPubKey.addresses[0];
        logger.info(`Address found in ScriptPubKey.Addresses: ${address}`);
      } else if (output.scriptPubKey.address) {
        address = output.scriptPubKey.address;
        logger.info(`Address found in ScriptPubKey.Address: ${address}`);
      } else {
        // Attempt to extract address from Asm or Hex if other methods fail
        logger.warn(
          `No addresses in ScriptPubKey.Addresses or ScriptPubKey.Address. Asm: ${output.scriptPubKey.asm}, Hex: ${output.scriptPubKey.hex}`
        );
        continue;
      }
  
      if (address === gatewayAddress) {
        // Add the value sent to the btcGatewayAddress across all relevant outputs
        const receivedAmount = BigInt((output.value * 1e8).toFixed(0)); // Value is in BTC, convert to Satoshis
        totalReceived += receivedAmount;
        logger.info(
          `Match found! Value added: ${receivedAmount} Satoshis. Total received so far: ${totalReceived} Satoshis`
        );
  
        // Assuming only one output per transaction can go to the btcGatewayAddress
        break;
      }
    }
  
    if (totalReceived === BigInt(0)) {
      logger.error(`ISendFlag transaction does not send to the gateway address. Transaction: ${tx.txid}`);
      throw new Error(`ISendFlag transaction does not send to the gateway address`);
    } else {
      logger.info(`Total amount received by gateway address ${gatewayAddress} in transaction ${tx.txid}: ${totalReceived} Satoshis`);
    }
  
    // Decode the event memo
    const [sourceAmount, destChainId, partnerId, recipient, err] = await decodeISendEventMemo(eventData);
    if (err) {
        throw new Error(`Error decoding ISend event: ${err}`);
    }
  
    if (totalReceived >= BigInt(sourceAmount)) {
      extractedData.SourceAmount = totalReceived;
    } else {
      throw new Error(`Amount received to gateway ${totalReceived} is less than sent in MEMO ${sourceAmount}`);
    }
  
    extractedData.DestChainId = destChainId;
    extractedData.PartnerId = partnerId;
    extractedData.Recipient = recipient;
    extractedData.Depositor = depositorAddress;
    extractedData.EventType = "ISend"
  
    prettyLogExtractedData(extractedData);
  
    try {
      await saveExtractedDataToDatabase(extractedData);
    } catch (err) {
      logger.error(`Failed to TransformGatewayISendEvent transaction: ${tx.txid}`, err);
      throw err;
    }
  
}

function decodeISendEventMemo(data: Buffer): [bigint, string, bigint, string, Error | null] {
  try {

      let offset = 0;

      // Read nonEvmFlag
      const nonEvmFlag = data.readUInt8(offset);
      offset += 1;

      // Read sourceAmount
      const sourceAmount = data.readBigUInt64BE(offset); // Big-endian
      offset += 8;

      // Read partnerId
      const partnerId = data.readBigUInt64BE(offset); // Big-endian
      offset += 8;

      let destChainId: string;
      let recipientSize: number;
      let recipientBytes: Buffer;

      switch (nonEvmFlag) {
          case 0x01:
              destChainId = "osmosis-1";
              recipientSize = data.length - offset; // Remaining size
              break;
          case 0x02:
              destChainId = "near";
              recipientSize = data.length - offset; // Remaining size
              break;
          default:
              const destChainIdBytes = data.slice(offset, offset + evmDestChainIdSize);
              destChainId = destChainIdBytes.toString('utf8').replace(/\0/g, ''); // Trim null bytes
              offset += evmDestChainIdSize;
              recipientSize = recipientSizeEVM;
              break;
      }

      // Read recipientBytes
      recipientBytes = data.slice(offset, offset + recipientSize);

      const recipientBase64 = recipientBytes.toString('base64');

      return [sourceAmount, destChainId, partnerId, recipientBase64, null];
  } catch (error) {
      console.error("Error decoding ISend event:", error);
      return [BigInt(0), "", BigInt(0),'', error];
  }
}


///////////////////////////////////////////////////////////////////////////////////////////
////////////////////////// IRECEIVE EVENT /////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////
async function processIReceiveEvent(
    txData: any,
    extractedData: ExtractedBitcoinData,
    eventData: Buffer,
    btcGatewayAddress: string
  ){
    logger.info("\nExtracting IReceiveFlag Data\n");
  
    let totalSent = BigInt(0);
    let involvesGatewayAddress = false
    
    // Iterate through the outputs to calculate the total amount sent
    for (const output of txData.vout) {
        if (output.scriptPubKey.address == btcGatewayAddress) {
          involvesGatewayAddress = true
        } else if (extractedData.Recipient == ''){
          // Convert the address to a Buffer and then to Base64
          const addressBuffer = Buffer.from(output.scriptPubKey.address, 'utf8');
          const recipientBase64 = addressBuffer.toString('base64');
          // Assign the Base64-encoded address to extractedData.Recipient
          extractedData.Recipient = recipientBase64;
          totalSent += BigInt((output.value * 1e8).toFixed(0)); // Value is in BTC, convert to Satoshis
        }
    }

    if (!involvesGatewayAddress) {
      throw new Error(`IReceiveFlag transaction does not involve the gateway address as the sender`);  
    }
  
    // Decode the IReceive event memo
    const [amount, requestIdentifier, srcChainID, err] = await decodeIReceiveEventMemo(eventData);
    if (err) {
      throw new Error(`Error decoding IReceive event: ${err}`);
    }

    if (totalSent!=amount) {
      throw new Error(`IReceiveFlag transaction does not match the amount sent to amount received from memo`);  
    }
    
    extractedData.DestAmount = amount;
    extractedData.SrcChainId = srcChainID;
    extractedData.RequestIdentifier = requestIdentifier;
    extractedData.Gateway = btcGatewayAddress;
    extractedData.EventType = "IReceive"
  
    prettyLogExtractedData(extractedData);

    try {
      await saveExtractedDataToDatabase(extractedData);
    } catch (err) {
      logger.error("Failed to TransformGatewayIReceiveEvent transaction:", txData, err);
      throw err;
    }
  
  }
  
function decodeIReceiveEventMemo(data: Buffer): [bigint, bigint, string, Error | null] {
  try {

    if (data.length < destAmountSize + depositIDSize + srcChainIDSize) {
      return [BigInt(0), BigInt(0), '', new Error("Data is too short")];
    }

    let offset = 0;

    // Read amount
    const amount = data.readBigUInt64BE(offset);
    offset += destAmountSize;

    // Read depositID
    const depositID = data.readBigUInt64BE(offset);
    offset += depositIDSize;

    // Read srcChainID
    const srcChainIDBytes = data.slice(offset, offset + srcChainIDSize);
    const srcChainID = srcChainIDBytes.toString('utf8').replace(/\0/g, ''); // Trim null bytes

    return [amount, depositID, srcChainID, null];
  } catch (error) {
    console.error("Error decoding IReceive event:", error);
    return [BigInt(0), BigInt(0), '', error];
  }
}
  

///////////////////////////////////////////////////////////////////////////////////////////
////////////////////////// SET DAPP METADATA EVENT ////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////
async function processSetDappMetadataEvent(tx: any, extractedData: ExtractedBitcoinData, eventData: Buffer, depositorAddress: string) {
  logger.info("Extracting SetDappMetadataFlag Data");

  if (depositorAddress !== gatewayAddress) {
      return Promise.reject(new Error(`The Depositor Address (${depositorAddress}) is not the same as Gateway address (${gatewayAddress})`));
  }

  let isSelfTransfer = true;
  for (const output of tx.vout) {
      const addresses = output.scriptPubKey.addresses || (output.scriptPubKey.address ? [output.scriptPubKey.address] : []);
      
      for (const address of addresses) {
          if (address !== gatewayAddress) {
              isSelfTransfer = false;
              break;
          }
      }
      
      if (!isSelfTransfer) break;
  }

  if (!isSelfTransfer) {
      return Promise.reject(new Error("SetDappMetadataFlag transaction is not a self-transfer"));
  }

  const feePayer = decodeSetDappMetaDataMemo(eventData);
  if (!feePayer) {
      return Promise.reject(new Error("Error decoding SetDappMetadata event"));
  }

  const feePayerAddress = "0x" + feePayer.toString('hex');
  extractedData.FeePayerAddress = feePayerAddress;
  extractedData.EventType = "SetDappMetadata"

  prettyLogExtractedData(extractedData);

  try {
      await saveExtractedDataToDatabase(extractedData);
  } catch (err) {
      logger.error("Failed to save SetDappMetadata event to database:", tx, err);
  }
}


function decodeSetDappMetaDataMemo(data: Buffer): Buffer | null {

    if (data.length !== feePayerSize) {
        throw new Error("Incorrect data size for Set Dapp Metadata Event");
    }

    const feePayer = data.slice(0, feePayerSize);

    return feePayer;
}


async function fetchTransactionFee(tx: any,): Promise<bigint> {
    let totalInputValue = BigInt(0);
    let totalOutputValue = BigInt(0);
  
    // Calculate total input value
    for (const vin of tx.vin) {
      try {
        const prevTxHash = vin.txid;
        const prevTx = await bitcoinClient.getRawTransaction(prevTxHash, true);
  
        if (vin.vout >= prevTx.vout.length) {
          throw new Error(`vout index out of range in previous transaction ${prevTxHash}`);
        }
  
        totalInputValue += BigInt((prevTx.vout[vin.vout].value * 1e8).toFixed(0)); // Convert BTC to Satoshi
      } catch (error) {
        throw new Error(`Error fetching previous transaction ${vin.txid}: ${error.message}`);
      }
    }
  
    // Calculate total output value
    for (const vout of tx.vout) {
      totalOutputValue += BigInt((vout.value * 1e8).toFixed(0)); // Convert BTC to Satoshi
    }
  
    // The fee is the total input value minus the total output value
    const fee = totalInputValue - totalOutputValue;
    return fee;
}

async function determineStartBlock(chainStateCollection: Collection<Document> | undefined, startBlockFromConfig?: number) {
    logger.info('Determining start block');
    const lastSyncedBlock = await getLastSyncedBlock(chainStateCollection as any);
    console.log("lastSyncedBlock : ", lastSyncedBlock);
    console.log("startBlockFromConfig : ", startBlockFromConfig);
    return startBlockFromConfig !== undefined ? startBlockFromConfig : lastSyncedBlock;
}

async function saveExtractedDataToDatabase(data: ExtractedBitcoinData): Promise<void> {
  const collection = await getCollection('contractEvents');
  if (!collection) throw new Error('Failed to retrieve contractEvents');

  // Define the unique field or combination of fields that identify the event
  const query = { TxHash: data.TxHash, DepositId: data.DepositId }; 

  // Check if the event already exists in the database
  const existingEvent = await collection.findOne(query);

  if (existingEvent) {
    console.log('Event already exists in the database, skipping insertion.');
    return; // Exit the function, event already exists
  }

  // Add a createdAt timestamp to the document
  const documentWithTimestamp = {
    ...data,
    createdAt: new Date() 
  };

  // Insert the new event
  await collection.insertOne(documentWithTimestamp);
}


export async function startStreamerService() {
  try {
    logger.info("Initializing Bitcoin Streamer");
    await initialize();
  } catch (error) {
    logger.error(`Failed to start listener service: ${error.message} -> Retrying after a delay...`);
    await closeMongoDBConnection();
    setTimeout(startStreamerService, 10000);
  }
}

function prettyLogExtractedData(extractedData: ExtractedBitcoinData) {
  
  const prettyData = {
    "Event Type": extractedData.EventType,
    "Block Height": extractedData.BlockHeight,
    "Block Timestamp": new Date(extractedData.BlockTimestamp * 1000).toISOString(),
    "Deposit ID": extractedData.DepositId.toString(),
    "Depositor Address": extractedData.Depositor,
    "Destination Amount": extractedData.DestAmount.toString(),
    "Destination Chain ID": extractedData.DestChainId,
    "Fee Payer Address": extractedData.FeePayerAddress,
    "Gas Burnt": extractedData.GasBurnt.toString(),
    "Gateway Address": extractedData.Gateway,
    "OpReturn Data": extractedData.OpReturnData,
    "Partner ID": extractedData.PartnerId.toString(),
    "Recipient": extractedData.Recipient,
    "Request Identifier": extractedData.RequestIdentifier.toString(),
    "Source Amount": extractedData.SourceAmount.toString(),
    "Source Chain ID": extractedData.SrcChainId,
    "Transaction Hash": extractedData.TxHash,
    "Log Timestamp": new Date().toISOString(),
  };

  // Use logger to log the formatted data
  logger.info(`EXTRACTED DATA FROM ${extractedData.EventType} EVENT:\n${JSON.stringify(prettyData, null, 2)}`);
  
}

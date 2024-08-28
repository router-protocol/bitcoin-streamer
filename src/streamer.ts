const Client = require('bitcoin-core');
import { initializeMongoDB, getCollection, closeMongoDBConnection } from './db/mongoDB';
import { Collection, Document } from 'mongodb';
import { updateLastUpdatedBlock, getLastSyncedBlock } from './db/mongoDB/action/chainState';
import logger from './logger';
import { getNetwork } from "./constant/index";
import { ChainGrpcMultiChainApi, getEndpointsForNetwork, getNetworkType } from '@routerprotocol/router-chain-sdk-ts';
require('dotenv').config();

const bitcoinClient = new Client({
  network: 'mainnet',
  username: process.env.BITCOIN_RPC_USER,
  password: process.env.BITCOIN_RPC_PASSWORD,
  host: '34.44.80.7', 
  port: 8332,
  ssl: false,
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
    TxHash: string;
    OpReturnData: string;
    SourceAmount: bigint;
    DestChainId: string;
    DepositId: number;
    PartnerId: bigint;
    Recipient: Buffer;
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

    const blockChainInfo =  await bitcoinClient.getBlockchainInfo()
    logger.info('Connected to Bitcoin node',blockChainInfo);

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

        if (currentBlock >= latestBlockNumber) {
        logger.info(`Current block number ${currentBlock} is >= latest block number ${latestBlockNumber}. Pausing for 10 seconds`);
        await new Promise(resolve => setTimeout(resolve, 10000));
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
    await processTransactionsInChunks(block, 1000); 
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
    logger.info(`Processing transactions ${i + 1} to ${Math.min(i + chunkSize, totalTxs)} in parallel`);
    
    // Process the transactions in parallel
    await Promise.all(chunk.map(async (txid: string) => {
      const transaction = await bitcoinClient.getRawTransaction(txid, true);
      await processTransaction(block,transaction);
    }));
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
                    logger.info(`Processing transaction ${transaction.txid}`);
                    const newProcessedEventNonce = await extractDataFromRPCTransaction(transaction,block,actualData);

                }
            }
        }

        // // Here, you would call a function similar to `extractDataFromRPCTransaction`
        // const newProcessedEventNonce = await extractDataFromRPCTransaction(transaction, actualData);

        // // Update the last processed nonce if needed
        // if (newProcessedEventNonce > lastProcessedEventNonce) {
        //     lastProcessedEventNonce = newProcessedEventNonce;
        // }

    } catch (error) {
        logger.error(`Error processing transaction ${transaction.txid}: ${error.message}`);
    }
}

async function extractDataFromRPCTransaction(tx: any, block: any, actualData: Buffer): Promise<number> {
  debugger
  const extractedData: ExtractedBitcoinData = {
    TxHash: tx.txid,
    OpReturnData: actualData.toString('hex'), // Assuming this is the data from OP_RETURN
    SourceAmount: BigInt(0),
    DestChainId: '',
    DepositId: 0,
    PartnerId: BigInt(0),
    Recipient: Buffer.alloc(0),
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

  extractedData.DepositId = (extractedData.BlockHeight << 32) | txIndex;

  const gasBurnt = await fetchTransactionFee(tx);
  extractedData.GasBurnt = gasBurnt;

  logger.info(`Current Processing Event Nonce: ${extractedData.DepositId}`);

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
      return await processISendEvent(tx, extractedData, eventData, depositorAddress, gatewayAddress);

    case IReceiveFlag:
      return await processIReceiveEvent(tx, extractedData, eventData, gatewayAddress);

    case SetDappMetadataFlag:
      return await processSetDappMetadataEvent(tx, extractedData, eventData, depositorAddress);

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
  ): Promise<number> {
    debugger
    logger.info("Extracting ISendEvent Data");
  
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
        const receivedAmount = BigInt(Math.floor(output.value * 1e8)); // Value is in BTC, convert to Satoshis
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
  
    logger.info(`Decoded data from ISend Event: ${sourceAmount} || ${destChainId} || ${partnerId} || ${recipient}`);
  
    if (totalReceived >= BigInt(sourceAmount)) {
      extractedData.SourceAmount = totalReceived;
    } else {
      throw new Error(`Amount received to gateway ${totalReceived} is less than sent in MEMO ${sourceAmount}`);
    }
  
    extractedData.DestChainId = destChainId;
    extractedData.PartnerId = partnerId;
    extractedData.Recipient = recipient;
    extractedData.Depositor = depositorAddress;
  
    logger.info("EXTRACTED DATA FROM ISEND EVENT:", extractedData);
  
    try {
      await saveExtractedDataToDatabase(extractedData);
    } catch (err) {
      logger.error(`Failed to TransformGatewayISendEvent transaction: ${tx.txid}`, err);
      throw err;
    }
  
    return extractedData.DepositId;
}

function decodeISendEventMemo(data: Buffer): [bigint, string, bigint, Buffer, Error | null] {
  debugger
    const reader = new DataView(data.buffer);
  
    let offset = 0;
  
    // Read nonEvmFlag
    const nonEvmFlag = reader.getUint8(offset);
    offset += 1;
  
    // Read sourceAmount
    const sourceAmount = reader.getBigUint64(offset, false); // false for Big Endian
    offset += 8;
  
    // Read partnerId
    const partnerId = reader.getBigUint64(offset, false); // false for Big Endian
    offset += 8;
  
    let destChainId: string;
    let recipientSize: number;
    let recipientBytes: Buffer;
  
    switch (nonEvmFlag) {
      case 0x01:
        destChainId = "osmo-test-5";
        recipientSize = data.length - offset; // Remaining size
        break;
      case 0x02:
        destChainId = "near-testnet";
        recipientSize = data.length - offset; // Remaining size
        break;
      default:
        const destChainIdBytes = Buffer.alloc(evmDestChainIdSize);
        data.copy(destChainIdBytes, 0, offset, offset + evmDestChainIdSize);
        destChainId = destChainIdBytes.toString('utf8').replace(/\0/g, '');
        offset += evmDestChainIdSize;
        recipientSize = recipientSizeEVM;
        break;
    }
  
    // Read recipientBytes
    recipientBytes = Buffer.alloc(recipientSize);
    data.copy(recipientBytes, 0, offset, offset + recipientSize);
  
    return [sourceAmount, destChainId, partnerId, recipientBytes, null];
}

///////////////////////////////////////////////////////////////////////////////////////////
////////////////////////// IRECEIVE EVENT /////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////
async function processIReceiveEvent(
    txData: any,
    extractedData: ExtractedBitcoinData,
    eventData: Buffer,
    btcGatewayAddress: string
  ): Promise<number> {
    logger.info("\nExtracting IReceiveFlag Data\n");
  
    let totalSent = BigInt(0);
  
    // Iterate through the outputs to calculate the total amount sent
    for (const output of txData.vout) {
      for (const address of output.scriptPubKey.addresses || []) {
        if (address !== btcGatewayAddress) {
          totalSent += BigInt(Math.floor(output.value * 1e8)); // Value is in BTC, convert to Satoshis
          break; // Assuming we break if one of the output addresses is not the btcGatewayAddress
        }
      }
    }
  
    // Decode the IReceive event memo
    const [amount, requestIdentifier, srcChainID, err] = await decodeIReceiveEventMemo(eventData);
    if (err) {
      throw new Error(`Error decoding IReceive event: ${err}`);
    }
  
    logger.info(`\nDecoded data from IReceive Event: ${amount} || ${srcChainID} || ${requestIdentifier}\n`);
  
    extractedData.DestAmount = amount;
    extractedData.SrcChainId = srcChainID;
    extractedData.RequestIdentifier = requestIdentifier;
    extractedData.Gateway = btcGatewayAddress;
  
    logger.info("\nEXTRACTED DATA FROM IRECEIVE EVENT:\n", extractedData);
  
    try {
      await saveExtractedDataToDatabase(extractedData);
    } catch (err) {
      logger.error("Failed to TransformGatewayIReceiveEvent transaction:", txData, err);
      throw err;
    }
  
    return extractedData.DepositId;
  }
  
function decodeIReceiveEventMemo(data: Buffer): [bigint, bigint,string, Error | null] {
  
    if (data.length < destAmountSize + depositIDSize + srcChainIDSize) {
      return [BigInt(0), BigInt(0),'',new Error("Data is too short")];
    }
  
    let offset = 0;
  
    const amount = data.readBigUInt64BE(offset);
    offset += destAmountSize;
  
    const depositID = data.readBigUInt64BE(offset);
    offset += depositIDSize;
  
    const srcChainIDBytes = data.slice(offset, offset + srcChainIDSize);
    const srcChainID = srcChainIDBytes.toString('utf8').replace(/\0/g, '');
  
    return [amount, depositID, srcChainID,null];
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
        for (const address of output.scriptPubKey.addresses) {
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
    logger.info(`Decoded data from SetDappMetadata Event: ${feePayerAddress}`);

    extractedData.FeePayerAddress = feePayerAddress;

    logger.info("EXTRACTED DATA FROM SET DAPP METADATA EVENT:", extractedData);

    try {
        await saveExtractedDataToDatabase(extractedData);
    } catch (err) {
        logger.error("Failed to TransformGatewaySetDappMetadataEvents transaction:", tx, err);
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
    debugger
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
  
        totalInputValue += BigInt(Math.floor(prevTx.vout[vin.vout].value * 1e8)); // Convert BTC to Satoshi
      } catch (error) {
        throw new Error(`Error fetching previous transaction ${vin.txid}: ${error.message}`);
      }
    }
  
    // Calculate total output value
    for (const vout of tx.vout) {
      totalOutputValue += BigInt(Math.floor(vout.value * 1e8)); // Convert BTC to Satoshi
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
  await collection.insertOne(data);
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

  
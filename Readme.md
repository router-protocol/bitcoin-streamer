# Steps to Run Bitcoin Streamer

Ensure that you have Docker, Node.js, and Yarn installed on your machine. If not, follow the installation guides below:

[Docker Installation Guide](https://docs.docker.com/get-docker/)

[Node.js Installation Guide](https://nodejs.org/en/download/)

[Yarn Installation Guide](https://classic.yarnpkg.com/en/docs/install)

1. **Git Clone**

`git clone https://github.com/router-protocol/bitcoin-streamer.git`

2. **Create `.env` file**
   ```
    cp .env.example .env
   ```
Update the following environment variables from `.env.example` file:
```yaml

MONGO_DB_URI=mongodb://mongodb:27016/bitcoin-streamer
CHAIN_ID=bitcoin
EXPLORER_ENVIRONMENT=mainnet
START_BLOCK=860725
PORT=8903
ALERTER_ACTIVE=
SLACK_WEBHOOK_URL=**https**://hooks.slack.com/services/FOR/YOUR/SLACK/WEBHOOK
PRUNE_AFTER=
CHUNK_SIZE=1000
BITCOIN_RPC_USER=
BITCOIN_RPC_PASSWORD=
BITCOIN_RPC_HOST=
BITCOIN_RPC_PORT=
BITCOIN_RPC_SSL=
```
`MONGO_DB_URI` is the URI of the MongoDB instance. We are running MongoDB locally, you have to use port defined in mongodb.     
`EXPLORER_ENVIRONMENT` either will be mainnet, testnet or alpha-devnet.     
`START_BLOCK` is block to be started from during intial start. omit this if you want to start from the 0th block or lastSyncedBlock in your db    
`PORT` to be exposed.     
`ALERTER_ACTIVE` and `SLACK_WEBHOOK_URL` is for slack health alerter.    
`START_BLOCK` is the overide block to be started from. If this is set, all other condition will be ignored.   
`PRUNE_AFTER` is the time in seconds after which the db data will be pruned.  
`CHUNK_SIZE` is the number of transactions you want to process in parallel. Adjust as per your needs. 1000 is optimal.  
`BITCOIN_RPC_USER` is the username to use to authenticate to the RPC server.  
`BITCOIN_RPC_PASSWORD`is the passphrase to use to authenticate to the RPC server.  
`BITCOIN_RPC_HOST` is the IP address of the RPC server you want to connect  
`BITCOIN_RPC_PORT` is the port of the RPC server you want to connect  
`BITCOIN_RPC_SSL` specifies whether transport layer security should be disabled.  



# Running the Bitcoin Streamer

1. **Run Start Db Script**
`bash scripts/start-db.sh`

2. **Run Docker Swarm Script**
`bash scripts/swarm-start.sh`

3. **Health Check for service**
`curl http://localhost:8903/health`

#### When restarting streamer, if .env file has START_BLOCK provided, streamer will start from the given START_BLOCK again.
#### If you wish to run from the lastSyncedBlock from the db, remove the START_BLOCK from .env and Run Docker Swarm Script


# Setting Up a Bitcoin Node with Transaction Indexing

This guide walks you through the steps to set up a Bitcoin node with transaction indexing enabled. Running a Bitcoin node will allow you to interact with the Bitcoin network directly, verify transactions, and store the full blockchain. Additionally, enabling transaction indexing will make it easier to query for specific transactions.

1. Install Bitcoin Core
   To begin, download and install the official Bitcoin Core client from https://bitcoin.org/en/download
   Bitcoin Core allows you to run a full node, which stores the entire Bitcoin blockchain locally.

   You can refer to installation steps from the below link based on your system on which you decide to run the node.
   https://bitcoin.org/en/full-node#setup-a-full-node

2. System Requirements

   Make sure your system meets the following requirements to run a full Bitcoin node:
   Disk Space: At least 1000 GB of available storage (more if txindex=1 is enabled).
   Memory: Minimum of 6 GB of RAM.
   Internet Connection: A stable connection with at least 200 GB of monthly bandwidth.
   Processor: A fast CPU will improve sync times. Minimum 8 Core
   Storage: Using an SSD will significantly speed up blockchain syncing and node performance.

3. Configure the Node
   After installation, you need to configure your Bitcoin node. Create or modify the configuration file bitcoin.conf located in your data directory:

   Linux: ~/.bitcoin/bitcoin.conf
   Windows: C:\Users\YourUserName\AppData\Roaming\Bitcoin\bitcoin.conf
   In the bitcoin.conf file, add the following lines:

   Enabling Transaction Indexing
   To index all Bitcoin transactions (allowing easy transaction lookup and querying), enable transaction indexing by adding:

   txindex=1

   This setting will increase storage requirements and the initial sync time, but it’s essential if you need to query transactions not related to your wallet.

   Optional: Enable Pruning (to Reduce Disk Usage)
   NOTE : Pruning will be disabled if using txindex=1
  
   If you don't need the full transaction history but still want to run a full node, you can enable pruning to save space by only keeping the most recent blocks. Add the following to your bitcoin.conf


4. Start Syncing the Blockchain
   
   Once you’ve configured your node, start Bitcoin Core. It will begin downloading and verifying the blockchain from the network. This process may take several days depending on your hardware and internet speed, especially with txindex=1 enabled.
   
   Syncing with txindex=1: The node will build an index of all past transactions, which adds extra time but enables you to easily query any transaction.

5. Keep Your Node Running
   For your node to stay up-to-date with the Bitcoin network, it needs to be running continuously. Your node will download new blocks as they are added to the network.

   Example Configuration (bitcoin.conf)
   Here’s an example configuration that enables transaction indexing and optional pruning:

   txindex=1
   maxconnections=40
   rpcuser=
   rpcpassword=

   Why Enable txindex=1?
   Enabling txindex=1 allows your Bitcoin node to maintain a full index of all transactions, not just those related to your wallet. This is essential for querying transactions that are not directly connected to your wallet addresses, which is particularly useful for developers, chain validators, and services requiring access to the full transaction history.
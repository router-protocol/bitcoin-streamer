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

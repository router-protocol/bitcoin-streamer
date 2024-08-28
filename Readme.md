# Steps to Run Azero Streamer

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

CONFIG_SERVICE_URL=https://pathfinder-internal.routerchain.dev/api/contracts
MONGO_DB_URI=mongodb://mongodb:27016/
MNEMONIC=pledge motion dawn decorate seed absurd warm link hip warrior garment element
CHAIN_ID=aleph-zero
AZERO_NODE_WS_URL=wss://ws.azero.dev
EXPLORER_ENVIRONMENT=mainnet
START_BLOCK=84376200
PORT=8903
ALERTER_ACTIVE=false
SLACK_WEBHOOK_URL=**https**://hooks.slack.com/services/FOR/YOUR/SLACK/WEBHOOK
```
`MONGO_DB_URI` is the URI of the MongoDB instance. We are running MongoDB locally, you have to use port defined in mongodb.   
`MNEMONIC` is used in streamer to create signer for utilizing instances of contracts. The wallet is not required to hold any funds.  
`EXPLORER_ENVIRONMENT` either will be mainnet, testnet or alpha-devnet.   
`START_BLOCK` is block to be started from during intial start. omit this if you want to start from the 0th block or lastSyncedBlock in your db  
`PORT` to be exposed.   
`ALERTER_ACTIVE` and `SLACK_WEBHOOK_URL` is for slack health alerter.  
`START_BLOCK` is the overide block to be started from. If this is set, all other condition will be ignored.  

# Running the Azero Streamer

1. **Run Start Db Script**
`bash scripts/start-db.sh`

2. **Run Docker Swarm Script**
`bash scripts/swarm-start.sh`

3. **Health Check for service**
`curl http://localhost:8903/health`

#### When restarting streamer, if .env file has START_BLOCK provided, streamer will start from the given START_BLOCK again.
#### If you wish to run from the lastSyncedBlock from the db, remove the START_BLOCK from .env and Run Docker Swarm Script

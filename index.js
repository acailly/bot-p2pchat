const crypto = require("crypto");
const Swarm = require("discovery-swarm");
const defaults = require("dat-swarm-defaults");
const getPort = require("get-port");
const readline = require("readline");
const get = require("lodash/get");

module.exports = function(vorpal) {
  vorpal
    .command("chat <message...>")
    .description("Send a message to everyone running this command")
    .action(function(args, callback) {
      const username = get(vorpal.config, "p2pchat.username", "unknown");
      sendMessage(`[${username}] ${args.message.join(" ")}`);
      callback();
    });
};

/**
 * Here we will save our TCP peer connections
 * using the peer id as key: { peer_id: TCP_Connection }
 */
const peers = {};
// Counter for connections, used for identify connections
let connSeq = 0;

// Peer Identity, a random hash for identify your peer
const myId = crypto.randomBytes(32);
// console.log('[DEBUG] Your identity: ' + myId.toString('hex'))

/**
 * Default DNS and DHT servers
 * This servers are used for peer discovery and establishing connection
 */
const config = defaults({
  // peer-id
  id: myId
});

/**
 * discovery-swarm library establishes a TCP p2p connection and uses
 * discovery-channel library for peer discovery
 */
const sw = Swarm(config);

const init = () => {
  // Choose a random unused port for listening TCP peer connections
  const port = getPort().then(port => {
    sw.listen(port);
    // console.log('[DEBUG] Listening to port: ' + port)

    /**
     * The channel we are connecting to.
     * Peers should discover other peers in this channel
     */
    sw.join("our-fun-channel");

    sw.on("connection", (conn, info) => {
      // Connection id
      const seq = connSeq;

      const peerId = info.id.toString("hex");
      // console.log(`[DEBUG] Connected #${seq} to peer: ${peerId}`)

      // Keep alive TCP connection with peer
      if (info.initiator) {
        try {
          conn.setKeepAlive(true, 600);
        } catch (exception) {
          console.error("exception", exception);
        }
      }

      conn.on("data", data => {
        // Here we handle incomming messages
        // console.log('[DEBUG] Received Message from peer ' + peerId)
        console.log(data.toString());
      });

      conn.on("close", () => {
        // Here we handle peer disconnection
        // console.log(`[DEBUG] Connection ${seq} closed, peer id: ${peerId}`)
        // If the closing connection is the last connection with the peer, removes the peer
        if (peers[peerId].seq === seq) {
          delete peers[peerId];
        }
      });

      // Save the connection
      if (!peers[peerId]) {
        peers[peerId] = {};
      }
      peers[peerId].conn = conn;
      peers[peerId].seq = seq;
      connSeq++;
    });
  });
};

const sendMessage = message => {
  // Broadcast to peers
  for (let id in peers) {
    peers[id].conn.write(message);
  }
};

init();

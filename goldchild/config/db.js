const mongoose = require('mongoose');

let goldchildConnection = null;
let goldchildConnectionPromise = null;

const connectGoldchildDB = async () => {
  if (goldchildConnection?.readyState === 1) {
    return goldchildConnection;
  }

  if (goldchildConnectionPromise) {
    return goldchildConnectionPromise;
  }

  const mongoUri = process.env.GOLDCHILD_MONGODB_URI || process.env.MONGODB_URI;
  const dbName = process.env.GOLDCHILD_DB_NAME || 'goldchild';

  if (!mongoUri) {
    throw new Error('Missing MongoDB URI for Goldchild. Set GOLDCHILD_MONGODB_URI or MONGODB_URI.');
  }

  goldchildConnectionPromise = mongoose
    .createConnection(mongoUri, {
      dbName,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000
    })
    .asPromise()
    .then((connection) => {
      goldchildConnection = connection;
      console.log(`💾 Goldchild MongoDB Connected: ${connection.host}/${connection.name}`);
      return connection;
    })
    .catch((error) => {
      goldchildConnectionPromise = null;
      console.error(`Goldchild DB connection failed: ${error.message}`);
      throw error;
    });

  return goldchildConnectionPromise;
};

module.exports = {
  connectGoldchildDB
};

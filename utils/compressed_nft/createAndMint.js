/**
  Overall flow of this script
  - load or create two keypairs (named `payer` and `testWallet`)
  - create a new tree with enough space to mint all the nft's you want for the "collection"
  - create a new NFT Collection on chain (using the usual Metaplex methods)
  - mint a single compressed nft into the tree to the `payer`
  - mint a single compressed nft into the tree to the `testWallet`
  - display the overall cost to perform all these actions

  ---
  NOTE: this script is identical to the `scripts/verboseCreateAndMint.ts` file, except THIS file has
  less console logging and explanation of what is occurring
*/

const { Keypair, LAMPORTS_PER_SOL, clusterApiUrl } = require("@solana/web3.js");
const { ValidDepthSizePair } = require("@solana/spl-account-compression");
const {
  MetadataArgs,
  TokenProgramVersion,
  TokenStandard,
} = require("@metaplex-foundation/mpl-bubblegum");
const { CreateMetadataAccountArgsV3 } = require("@metaplex-foundation/mpl-token-metadata");

// import custom helpers for demos
const { loadKeypairFromFile, loadOrGenerateKeypair, numberFormatter } = require("./helpers");

// import custom helpers to mint compressed NFTs
const { createCollection, createTree, mintCompressedNFT } = require("./compression");

// local import of the connection wrapper, to help with using the ReadApi
const { WrapperConnection } = require("./WrapperConnection");
const config = require('./../../config');

// define some reusable balance values for tracking
let initBalance, balance;

const createAndMint = async () => {
  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  // generate a new Keypair for testing, named `wallet`
  const testWallet = loadOrGenerateKeypair("testWallet");

  // generate a new keypair for use in this demo (or load it locally from the filesystem when available)
  const payer = config.LOCAL_PAYER_JSON_ABSPATH
    ? loadKeypairFromFile(config.LOCAL_PAYER_JSON_ABSPATH)
    : loadOrGenerateKeypair("payer");

  console.log("Payer address:", payer.publicKey.toBase58());
  console.log("Test wallet address:", testWallet.publicKey.toBase58());

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  // load the env variables and store the cluster RPC url
  const CLUSTER_URL = config.RPC_URL ?? clusterApiUrl("devnet");

  // create a new rpc connection, using the ReadApi wrapper
  const connection = new WrapperConnection(CLUSTER_URL, "confirmed");

  // get the payer's starting balance (only used for demonstration purposes)
  initBalance = await connection.getBalance(payer.publicKey);

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  /*
    Define our tree size parameters
  */
  const maxDepthSizePair = {
    // max=16,384 nodes
    maxDepth: 14,
    maxBufferSize: 64,
  };
  const canopyDepth = maxDepthSizePair.maxDepth - 5;

  /*
    Actually allocate the tree on chain
  */

  // define the address the tree will live at
  const treeKeypair = Keypair.generate();

  // create and send the transaction to create the tree on chain
  const tree = await createTree(connection, payer, treeKeypair, maxDepthSizePair, canopyDepth);

  /*
    Create the actual NFT collection (using the normal Metaplex method)
    (nothing special about compression here)
  */

  // define the metadata to be used for creating the NFT collection
  const collectionMetadataV3 = {
    data: {
      name: "Texaglo Collection",
      symbol: "Texaglo",
      // specific json metadata for the collection
      uri: "https://supersweetcollection.notarealurl/collection.json",
      sellerFeeBasisPoints: 100,
      creators: [
        {
          address: payer.publicKey,
          verified: false,
          share: 100,
        },
      ],
      collection: null,
      uses: null,
    },
    isMutable: false,
    collectionDetails: null,
  };

  // create a full token mint and initialize the collection (with the `payer` as the authority)
  const collection = await createCollection(connection, payer, collectionMetadataV3);

  /*
    Mint a single compressed NFT
  */

  const compressedNFTMetadata = {
    name: "NFT Name",
    symbol: collectionMetadataV3.data.symbol,
    // specific json metadata for each NFT
    uri: "https://supersweetcollection.notarealurl/token.json",
    creators: [
      {
        address: payer.publicKey,
        verified: false,
        share: 100,
      },
      {
        address: testWallet.publicKey,
        verified: false,
        share: 0,
      },
    ],
    editionNonce: 0,
    uses: null,
    collection: null,
    primarySaleHappened: false,
    sellerFeeBasisPoints: 0,
    isMutable: false,
    // these values are taken from the Bubblegum package
    tokenProgramVersion: TokenProgramVersion.Original,
    tokenStandard: TokenStandard.NonFungible,
  };

  // fully mint a single compressed NFT to the payer
  console.log(`Minting a single compressed NFT to ${payer.publicKey.toBase58()}...`);

  await mintCompressedNFT(
    connection,
    payer,
    treeKeypair.publicKey,
    collection.mint,
    collection.metadataAccount,
    collection.masterEditionAccount,
    compressedNFTMetadata,
    // mint to this specific wallet (in this case, the tree owner aka `payer`)
    payer.publicKey,
  );

  // fully mint a single compressed NFT
  console.log(`Minting a single compressed NFT to ${testWallet.publicKey.toBase58()}...`);

  await mintCompressedNFT(
    connection,
    payer,
    treeKeypair.publicKey,
    collection.mint,
    collection.metadataAccount,
    collection.masterEditionAccount,
    compressedNFTMetadata,
    // mint to this specific wallet (in this case, airdrop to `testWallet`)
    testWallet.publicKey,
  );

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  // fetch the payer's final balance
  balance = await connection.getBalance(payer.publicKey);

  console.log(`===============================`);
  console.log(
    "Total cost:",
    numberFormatter((initBalance - balance) / LAMPORTS_PER_SOL, true),
    "SOL\n",
  );
};

module.exports = { createAndMint }

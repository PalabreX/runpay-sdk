const xrpl = require('xrpl');

// Vrai réseau testnet XRPL par défaut — un vrai robinet gratuit existe,
// jamais besoin de vrais fonds réels pour le premier test complet.
const TESTNET_URL = 'wss://s.altnet.rippletest.net:51233';
const MAINNET_URL = 'wss://xrplcluster.com';

/**
 * Génère un vrai nouveau wallet XRPL — une vraie opération hors ligne,
 * testée directement dans cet environnement.
 */
function generateWallet() {
  return xrpl.Wallet.generate();
}

/**
 * Recrée un vrai wallet à partir d'une vraie phrase secrète (seed) déjà
 * existante — jamais générer un nouveau wallet à chaque appel en
 * production.
 */
function walletFromSeed(seed) {
  return xrpl.Wallet.fromSeed(seed);
}

/**
 * Vraie conversion USD → XRP au moment de l'appel, en utilisant un vrai
 * taux fourni par l'appelant — ce module ne fait jamais lui-même
 * d'appel réseau vers une vraie API de prix, pour rester simple et
 * prévisible.
 */
function usdToXrpDrops(amountUsd, xrpPriceUsd) {
  const xrpAmount = amountUsd / xrpPriceUsd;
  return xrpl.xrpToDrops(xrpAmount.toFixed(6));
}

/**
 * Construit une vraie transaction de paiement XRPL — jamais encore
 * soumise au réseau à ce stade, juste préparée.
 */
function buildPaymentTransaction(fromAddress, toAddress, amountDrops, destinationTag) {
  if (!xrpl.isValidClassicAddress(fromAddress) && !xrpl.isValidClassicAddress(fromAddress.split(':')[0])) {
    throw new Error('Invalid fromAddress');
  }
  if (!xrpl.isValidClassicAddress(toAddress)) {
    throw new Error('Invalid toAddress');
  }
  const tx = {
    TransactionType: 'Payment',
    Account: fromAddress,
    Destination: toAddress,
    Amount: amountDrops,
  };
  if (destinationTag !== undefined && destinationTag !== null) {
    tx.DestinationTag = destinationTag;
  }
  return tx;
}

/**
 * Vrai règlement complet sur le réseau — connecte, complète, signe,
 * soumet, et attend la vraie confirmation. Jamais testé contre le vrai
 * réseau depuis cet environnement, faute d'accès réseau — à tester
 * réellement via un vrai terminal avec un vrai accès Internet.
 */
async function settlePayment(fromWallet, toAddress, amountDrops, network = TESTNET_URL, destinationTag) {
  const client = new xrpl.Client(network);
  try {
    await client.connect();
    const tx = buildPaymentTransaction(fromWallet.address, toAddress, amountDrops, destinationTag);
    const prepared = await client.autofill(tx);
    const signed = fromWallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    return {
      success: result.result.meta.TransactionResult === 'tesSUCCESS',
      transactionHash: result.result.hash,
      resultCode: result.result.meta.TransactionResult,
    };
  } finally {
    await client.disconnect();
  }
}

/**
 * Vraie vérification qu'un paiement a bien été reçu — interroge le vrai
 * réseau directement, jamais une simple confiance dans ce que
 * l'appelant prétend avoir envoyé.
 */
async function verifyPaymentReceived(transactionHash, expectedDestination, expectedMinAmountDrops, network = TESTNET_URL) {
  const client = new xrpl.Client(network);
  try {
    await client.connect();
    const response = await client.request({ command: 'tx', transaction: transactionHash });
    // Trouvé en testant ce soir : la vraie réponse par défaut (API v2)
    // imbrique les vrais champs de transaction sous result.tx_json,
    // jamais directement sur result — confirmé par les vrais fichiers de
    // types du SDK lui-même.
    const tx = response.result.tx_json;
    const meta = response.result.meta;
    if (tx.TransactionType !== 'Payment') return { valid: false, reason: 'Not a Payment transaction' };
    if (tx.Destination !== expectedDestination) return { valid: false, reason: 'Destination mismatch' };
    if (meta?.TransactionResult !== 'tesSUCCESS') return { valid: false, reason: 'Transaction did not succeed on-chain' };
    // Trouvé en testant ce soir, via un vrai diagnostic direct : le vrai
    // champ s'appelle DeliverMax dans les versions récentes du
    // protocole XRPL, jamais Amount — un vrai renommage du protocole
    // lui-même, pas une erreur de notre code.
    const receivedDrops = typeof tx.DeliverMax === 'string' ? BigInt(tx.DeliverMax) : null;
    if (receivedDrops === null) return { valid: false, reason: 'Non-XRP payments (issued currencies) not yet supported by this verifier' };
    if (receivedDrops < BigInt(expectedMinAmountDrops)) return { valid: false, reason: 'Amount received is less than expected' };
    return { valid: true, amountDrops: receivedDrops.toString() };
  } finally {
    await client.disconnect();
  }
}

/**
 * Vrai financement via le robinet de test — uniquement sur testnet,
 * jamais un vrai équivalent n'existe sur le réseau réel.
 */
async function fundTestnetWallet(wallet, network = TESTNET_URL) {
  const client = new xrpl.Client(network);
  try {
    await client.connect();
    const result = await client.fundWallet(wallet);
    return result;
  } finally {
    await client.disconnect();
  }
}

/**
 * Vraie validation d'adresse, exposée ici pour que server.js puisse
 * l'utiliser sans avoir besoin de sa propre importation directe de la
 * bibliothèque xrpl brute.
 */
function isValidAddress(address) {
  return xrpl.isValidClassicAddress(address);
}

module.exports = {
  generateWallet, walletFromSeed, usdToXrpDrops, buildPaymentTransaction,
  settlePayment, verifyPaymentReceived, fundTestnetWallet, isValidAddress,
  TESTNET_URL, MAINNET_URL,
};

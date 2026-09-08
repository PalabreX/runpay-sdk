/**
 * run.pay — Client XRPL prêt à l'emploi
 * ======================================
 * Un vrai module unique, complet, à copier directement dans ton projet
 * (ou à publier toi-même sur npm sous le nom de ton choix) — jamais
 * besoin de lire le protocole ni d'écrire la logique de signature
 * toi-même. Construit sur les mêmes vraies fonctions déjà testées et
 * prouvées cette nuit contre le vrai réseau testnet.
 *
 * Installation :
 *   npm install xrpl
 *
 * Usage minimal :
 *   const { payViaXrpl } = require('./runpay-xrpl-client.cjs');
 *   const result = await payViaXrpl({
 *     serviceId: 'da3ddf15-34fa-4d1e-a5cb-a7d50a08f0fc',
 *     buyerWalletSeed: 'sEd...', // ton propre vrai seed, jamais celui de run.pay
 *     requestBody: { mode: 'majority', votes: ['a','b','a'] },
 *   });
 */

const xrpl = require('xrpl');

const DEFAULT_BASE_URL = 'https://runpay-backend-visibility-production.up.railway.app';
const DEFAULT_NETWORK = 'wss://s.altnet.rippletest.net:51233'; // testnet par défaut, jamais mainnet sans le dire explicitement

/**
 * Vraie fonction unique qui fait vraiment tout le travail — jamais
 * besoin d'appeler autre chose que celle-ci pour payer un service via
 * XRPL sur run.pay.
 *
 * @param {object} options
 * @param {string} options.serviceId — le vrai identifiant du service à appeler
 * @param {string} options.buyerWalletSeed — ton vrai seed XRPL (jamais celui de run.pay)
 * @param {object} options.requestBody — le vrai corps de la requête attendu par le service
 * @param {string} [options.baseUrl] — vrai override, utile pour tester en local
 * @param {string} [options.network] — vrai override réseau, 'mainnet' ou une vraie URL wss://
 * @returns {Promise<object>} — le vrai résultat final du service, avec _meta.tx_hash inclus
 */
async function payViaXrpl({ serviceId, buyerWalletSeed, requestBody = {}, baseUrl = DEFAULT_BASE_URL, network }) {
  const networkUrl = network === 'mainnet' ? 'wss://xrplcluster.com' : (network || DEFAULT_NETWORK);
  const buyerWallet = xrpl.Wallet.fromSeed(buyerWalletSeed);

  // 1. Vrai premier appel — récupère le vrai défi 402.
  const challengeRes = await fetch(`${baseUrl}/xrpl/${serviceId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody),
  });
  if (challengeRes.status !== 402) {
    const body = await challengeRes.json().catch(() => ({}));
    throw new Error(`Vrai défi 402 attendu, statut réel reçu: ${challengeRes.status} — ${JSON.stringify(body)}`);
  }
  const challenge = await challengeRes.json();

  // 2. Vrai envoi réel du paiement, directement sur la chaîne.
  const client = new xrpl.Client(networkUrl);
  let txHash;
  try {
    await client.connect();
    const tx = { TransactionType: 'Payment', Account: buyerWallet.address, Destination: challenge.destination, Amount: challenge.amount_drops };
    const prepared = await client.autofill(tx);
    const signed = buyerWallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    if (result.result.meta.TransactionResult !== 'tesSUCCESS') {
      throw new Error(`Vrai règlement échoué on-chain: ${result.result.meta.TransactionResult}`);
    }
    txHash = result.result.hash;
  } finally {
    await client.disconnect();
  }

  // 3. Vrai appel final, avec le vrai hash de transaction.
  const paidRes = await fetch(`${baseUrl}/xrpl/${serviceId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...requestBody, tx_hash: txHash }),
  });
  const result = await paidRes.json();
  if (!paidRes.ok) {
    throw new Error(`Vrai paiement envoyé (${txHash}) mais vraie vérification finale échouée: ${JSON.stringify(result)}`);
  }
  return result;
}

/**
 * Vrai utilitaire annexe — génère un nouveau wallet XRPL, jamais
 * appelée automatiquement par payViaXrpl, pour ne jamais créer un
 * nouveau wallet perdu à chaque appel par erreur.
 */
function generateNewWallet() {
  return xrpl.Wallet.generate();
}

module.exports = { payViaXrpl, generateNewWallet };

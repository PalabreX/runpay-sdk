// Module d'exploration paiement x402 / USDC sur Base — TESTNET/MAINNET
// selon le réseau choisi, jamais mélangés.
//
// Validé dans cet environnement : génération de compte EVM, construction
// et signature EIP-712 d'une autorisation EIP-3009 (transferWithAuthorization),
// et vérification réelle de cette signature — toutes des opérations
// cryptographiques hors ligne, confirmées fonctionnelles.
//
// PAS ENCORE VALIDÉ ICI : connexion réseau réelle, soumission au
// facilitateur x402, réception réelle d'une réponse 402 puis d'un vrai
// résultat après paiement. Le bac à sable de développement n'autorise
// pas les connexions sortantes vers les domaines Base/Coinbase — ces
// étapes doivent être testées dans un environnement avec un vrai accès
// réseau, exactement comme pour le module RLUSD.
//
// ⚠️  DEUX VRAIES ERREURS TROUVÉES ET CORRIGÉES PENDANT CETTE VALIDATION,
// LAISSÉES ICI COMME AVERTISSEMENT CONCRET :
// 1. Une adresse de test tapée à la main avait un caractère manquant
//    (40 au lieu de 42) — jamais détecté à l'œil nu, seulement par la
//    vraie validation de la bibliothèque. Toujours utiliser getAddress()
//    pour valider une adresse avant de l'utiliser dans une vraie
//    signature, jamais faire confiance à une adresse tapée ou copiée
//    manuellement.
// 2. L'adresse USDC testnet (Base Sepolia) trouvée dans cette recherche
//    ne vient que d'une seule source (un article de blog), contrairement
//    aux trois sources croisées pour RLUSD — à vérifier vous-même contre
//    la documentation officielle de Circle avant tout usage réel :
//    https://developers.circle.com/stablecoins/usdc-contract-addresses

const { privateKeyToAccount, generatePrivateKey } = require('viem/accounts');
const { getAddress, verifyTypedData } = require('viem');
const crypto = require('crypto');

const NETWORKS = {
  base_mainnet: {
    chainId: 8453,
    usdcAddress: getAddress('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'), // vérifié
  },
  base_sepolia_testnet: {
    chainId: 84532,
    usdcAddress: getAddress('0x036CbD53842c5426634e7929541eC2318f3dCF7e'), // ⚠️ une seule source — à revérifier avant usage réel
  },
};

const EIP3009_DOMAIN_NAME = 'USD Coin';
const EIP3009_DOMAIN_VERSION = '2';

const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

/**
 * Génère un vrai compte EVM — pure cryptographie locale.
 * Validé fonctionnel dans cet environnement.
 */
function generateAccount() {
  return privateKeyToAccount(generatePrivateKey());
}

/**
 * Valide et normalise une adresse — TOUJOURS utiliser cette fonction
 * avant d'utiliser une adresse tapée ou copiée manuellement. Trouvé en
 * creusant : une adresse invalide (mauvaise longueur) ne se voit jamais
 * à l'œil nu dans une chaîne hexadécimale.
 */
function validateAddress(address) {
  return getAddress(address); // lève une vraie erreur si invalide
}

/**
 * Construit une vraie autorisation EIP-3009, structure exacte vérifiée
 * contre la documentation réelle du protocole x402.
 */
function buildTransferAuthorization(fromAddress, toAddress, amountUsdc, validitySeconds = 3600) {
  const nonce = '0x' + crypto.randomBytes(32).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  return {
    from: validateAddress(fromAddress),
    to: validateAddress(toAddress),
    value: BigInt(Math.round(amountUsdc * 1e6)), // USDC a 6 décimales
    validAfter: 0n,
    validBefore: BigInt(now + validitySeconds),
    nonce,
  };
}

/**
 * Signe réellement une autorisation EIP-3009 — validé fonctionnel hors
 * ligne. C'est une signature off-chain uniquement ; aucune transaction
 * on-chain n'est soumise ici, le facilitateur s'en charge après
 * vérification.
 */
async function signTransferAuthorization(account, authorization, network = 'base_mainnet', domainOverride = null, assetAddressOverride = null) {
  const { chainId, usdcAddress } = NETWORKS[network];
  // Trouvé en comparant contre une vraie réponse 402 en direct : le nom
  // et la version du domaine EIP-712 doivent venir de ce que le serveur
  // déclare réellement (champ extra.name/extra.version), jamais d'une
  // constante codée en dur — une signature EIP-712 est spécifique à son
  // domaine, une valeur incorrecte produit une signature cryptographiquement
  // invalide même si l'intention sous-jacente est identique.
  const domainName = domainOverride?.name || EIP3009_DOMAIN_NAME;
  const domainVersion = domainOverride?.version || EIP3009_DOMAIN_VERSION;
  // Même vrai principe, étendu ici à l'adresse du contrat elle-même —
  // trouvé après un vrai échec "verification_failed" sur mainnet, jamais
  // repéré avant puisque test402 et PayAI utilisaient la même vraie
  // adresse testnet que celle codée en dur, masquant cette vraie faille.
  const verifyingContract = assetAddressOverride ? getAddress(assetAddressOverride) : usdcAddress;
  const domain = { name: domainName, version: domainVersion, chainId, verifyingContract };
  const signature = await account.signTypedData({ domain, types: EIP3009_TYPES, primaryType: 'TransferWithAuthorization', message: authorization });
  return { signature, domain, types: EIP3009_TYPES, message: authorization };
}

/**
 * Vérifie réellement une signature — exactement ce qu'un vrai
 * facilitateur x402 ferait côté serveur. Validé fonctionnel hors ligne,
 * y compris le vrai rejet d'une signature usurpée pour une autre adresse.
 */
async function verifyTransferAuthorization(claimedSignerAddress, signedPayload) {
  return verifyTypedData({
    address: validateAddress(claimedSignerAddress),
    domain: signedPayload.domain,
    types: signedPayload.types,
    primaryType: 'TransferWithAuthorization',
    message: signedPayload.message,
    signature: signedPayload.signature,
  });
}

/**
 * PROCHAINE ÉTAPE RÉELLE, non testée dans cet environnement — nécessite
 * un vrai accès réseau sortant. Séquence complète attendue pour que
 * run.pay serve de pont (option 2 déjà décidée — l'agent paie en
 * dollars via Stripe comme aujourd'hui, jamais directement en crypto) :
 *   1. Appeler le vrai endpoint x402 externe une première fois
 *   2. Recevoir la vraie réponse 402 avec les vraies exigences de paiement
 *   3. Construire et signer l'autorisation EIP-3009 avec le wallet de
 *      run.pay (jamais celui de l'agent, cohérent avec l'option 2)
 *   4. Rejouer la requête avec l'en-tête PAYMENT-SIGNATURE réel
 *   5. Recevoir le vrai résultat, puis débiter l'agent en dollars côté
 *      run.pay comme n'importe quel appel de service existant
 */
/**
 * Flux complet réel d'appel d'un service x402 externe — construit à
 * partir de la documentation vérifiée, mais jamais testé en direct dans
 * cet environnement (restriction réseau du bac à sable, confirmée à
 * plusieurs reprises, pas contournable ni à contourner).
 *
 * ⚠️ VRAIE INCERTITUDE HONNÊTE : mes sources de recherche divergent sur
 * le nom exact de l'en-tête de retour après signature — 'PAYMENT-SIGNATURE'
 * chez certaines sources, 'X-PAYMENT' chez d'autres. Le code ci-dessous
 * envoie les deux en même temps par prudence, mais le VRAI nom à utiliser
 * doit être confirmé contre la vraie réponse d'un service réel au premier
 * test — ne jamais faire confiance à ce choix sans vérification.
 */
async function callExternalX402Service(url, account, network = 'base_mainnet', method = 'GET') {
  // 1. Premier appel réel — sans paiement, pour obtenir les vraies
  // exigences exactes du service (montant, destinataire, réseau).
  // Trouvé en testant contre un vrai service qui exige POST : la
  // méthode HTTP n'est pas fixée par le protocole x402 lui-même, chaque
  // service choisit la sienne — jamais supposer GET par défaut sans
  // vérifier.
  const firstResponse = await fetch(url, { method });
  if (firstResponse.status !== 402) {
    throw new Error(`Expected a 402 Payment Required response, got ${firstResponse.status}`);
  }

  // 2. Analyse réelle des exigences de paiement — trouvé en creusant que
  // la vraie spécification v2 privilégie un en-tête PAYMENT-REQUIRED
  // encodé en base64 (corps de réponse vide {} pour ne jamais casser les
  // outils de surveillance existants), mais certains services réels
  // (comme PayAI) mettent quand même ces informations dans le corps —
  // on essaie les deux, jamais un seul format supposé universel.
  let paymentRequirements;
  const headerValue = firstResponse.headers.get('payment-required') || firstResponse.headers.get('PAYMENT-REQUIRED');
  if (headerValue) {
    try {
      paymentRequirements = JSON.parse(Buffer.from(headerValue, 'base64').toString('utf8'));
    } catch {
      paymentRequirements = await firstResponse.json();
    }
  } else {
    paymentRequirements = await firstResponse.json();
  }
  const requirement = paymentRequirements.accepts?.[0] || paymentRequirements;
  if (!requirement?.payTo || !requirement?.amount) {
    throw new Error('Unexpected 402 response shape (checked both PAYMENT-REQUIRED header and response body) — real format must be confirmed against a live service before trusting this parsing logic');
  }

  // DIAGNOSTIC TEMPORAIRE COMPLET — affiche absolument tout ce que le
  // service a vraiment déclaré, avant même de signer quoi que ce soit.
  console.log('=== DIAGNOSTIC COMPLET: vraies exigences declarees ===');
  console.log(JSON.stringify(requirement, null, 2));
  console.log('========================================================');

  // 3. Construction et signature réelle de l'autorisation, avec le
  // wallet de run.pay — jamais celui de l'agent, cohérent avec l'option 2
  // déjà décidée.
  const amountUsdc = parseFloat(requirement.amount) / 1e6;
  // Trouvé en comparant precisement chaque champ contre un vrai echec :
  // le service declare maxTimeoutSeconds=3600, et le repli par defaut de
  // buildTransferAuthorization utilise EXACTEMENT cette meme valeur —
  // aucune vraie marge de securite contre un decalage d'horloge ou un
  // delai reseau entre la signature et sa verification. Utilise une
  // vraie fenetre plus courte et plus sure, jamais coller au maximum
  // exact autorise par le serveur.
  const safeValiditySeconds = Math.min(300, parseInt(requirement.maxTimeoutSeconds) || 300);
  const authorization = buildTransferAuthorization(account.address, requirement.payTo, amountUsdc, safeValiditySeconds);
  console.log('=== DIAGNOSTIC: autorisation reelle construite ===');
  console.log(JSON.stringify(authorization, (k,v) => typeof v === 'bigint' ? v.toString() : v, 2));
  console.log('====================================================');
  const signed = await signTransferAuthorization(account, authorization, network, requirement.extra, requirement.asset);
  console.log('=== DIAGNOSTIC: vrai domaine EIP-712 utilise pour signer ===');
  console.log(JSON.stringify(signed.domain, null, 2));
  console.log('==============================================================');

  // Vraie auto-verification, avant meme d'envoyer quoi que ce soit —
  // confirme si la signature est vraiment coherente avec elle-meme, pour
  // savoir si un vrai bug reste dans la mecanique de signature, ou si
  // c'est plutot un vrai desaccord de contenu avec ce que le serveur
  // reconstruit independamment de son cote.
  const selfCheck = await verifyTransferAuthorization(account.address, signed);
  console.log('=== DIAGNOSTIC: auto-verification de la signature ===');
  console.log('La signature est-elle vraiment coherente avec elle-meme ?', selfCheck);
  console.log('=======================================================');

  // 4. Encodage réel du paiement signé pour l'en-tête de retour. Les
  // valeurs BigInt (value, validAfter, validBefore) doivent être
  // converties en chaînes avant JSON.stringify — trouvé en testant
  // contre un vrai service, JavaScript ne sait pas sérialiser un BigInt
  // nativement. Cohérent avec le vrai format observé (montants envoyés
  // comme chaînes, pas comme nombres).
  // Confirme par un vrai exemple officiel complet de Coinbase (docs.cdp.coinbase.com) :
  // value/validAfter/validBefore sont bien des chaines dans la vraie
  // specification, pas des nombres — revert de l'hypothese precedente,
  // meme si les deux ont produit la meme erreur (confirmant que ce
  // n'etait deja pas la vraie cause).
  const serializableAuthorization = {
    ...authorization,
    value: authorization.value.toString(),
    validAfter: authorization.validAfter.toString(),
    validBefore: authorization.validBefore.toString(),
  };
  // Trouvé le vrai bug exact ce soir, confirmé par un vrai expert EIP-3009
  // sur GitHub : la vraie spécification v2 exige que 'accepted' contienne
  // l'objet complet de l'exigence sélectionnée — jamais scheme/network
  // séparés au niveau supérieur. Notre propre vérification reste
  // tolérante à cette vraie erreur (jamais vérifiée), ce qui expliquait
  // pourquoi ça fonctionnait toujours en interne mais échouait contre de
  // vrais vérificateurs stricts comme CoinGecko.
  const paymentPayload = Buffer.from(JSON.stringify({
    x402Version: 2,
    accepted: requirement,
    payload: { signature: signed.signature, authorization: serializableAuthorization },
  }), 'utf8').toString('base64');
  console.log('========================================');

  // 5. Nouvelle tentative réelle avec la signature — trouvé en creusant
  // un vrai echec "no matching payment method" que l'envoi simultane des
  // deux noms d'en-tete pouvait semer la confusion. N'envoie plus que le
  // vrai en-tete confirme par la documentation officielle de ce service.
  const paidResponse = await fetch(url, {
    method,
    headers: {
      'PAYMENT-SIGNATURE': paymentPayload,
    },
  });
  if (!paidResponse.ok) {
    // Trouvé en creusant : le message d'erreur précédent jetait le vrai
    // contenu de la réponse, cachant l'information la plus utile pour
    // diagnostiquer précisément pourquoi le service a refusé.
    const bodyText = await paidResponse.text().catch(() => '(corps de réponse illisible)');
    throw new Error(`Payment was submitted but the service still returned ${paidResponse.status}. Real response body: ${bodyText}`);
  }

  // 6. Vrai résultat, prêt à être renvoyé à l'agent qui a payé en
  // dollars via son solde run.pay habituel — il ne voit jamais cette
  // couche crypto. Le vrai coût réellement avancé est inclus
  // explicitement — trouvé en implémentant la marge que ce champ
  // n'était jamais rempli auparavant, faisant silencieusement retomber
  // la facturation sur le maximum accepté plutôt que le vrai coût réel.
  const serviceResult = await paidResponse.json();
  return { ...serviceResult, _runpay_bridge_cost_usd: amountUsdc };
}

module.exports = {
  NETWORKS, generateAccount, validateAddress, buildTransferAuthorization,
  signTransferAuthorization, verifyTransferAuthorization, callExternalX402Service,
};

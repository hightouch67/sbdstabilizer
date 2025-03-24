const dsteem = require('dsteem');
const exchange = getExternalExchangeApi();  // TODO

const stabilizerAccount = "steemstabilizer";
const daoAccount = "steem.dao";

const client = new dsteem.Client('https://api.steemit.com');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  while (true) {
    const a = await client.database.getAccounts([stabilizerAccount]);
    const account = a[0];
    const steemBal = account.balance;
    const steemChunk = Math.min(steemBal.amount, Math.max(100, steemBal.amount * 0.1));
    const sbdBal = account.sbd_balance;
    const printRate = (await client.database.getDynamicGlobalProperties()).sbd_print_rate;
    const orderBook = await client.database.getOrderBook(1);
    const bestOffer = orderBook.asks[0];
    const bestBid = orderBook.bids[0];
    const rewardSbd = account.reward_sbd_balance;
    const rewardSteem = account.reward_steem_balance;
    const rewardVests = account.reward_vesting_balance;
    const marketPrice = (steemBal.amount > 0.1 || sbdBal.amount > 0.1)
      ? await exchange.getPrice("STEEM")
      : 0;

    if (Math.random() * 25 > 0) {
      // Do nothing
    } else if ((bestOffer.price - bestBid.price) / (bestOffer.price + bestBid.price) > 0.01) {
      // Wide market spread, wait for better
    } else if (sbdBal.amount >= 100) {
      if (marketPrice < 1.005 * bestOffer.real_price) {
        if (printRate === 10000 && marketPrice < 1.00 * bestOffer.real_price) {
          await convertSbdToSteem(stabilizerAccount, sbdBal.amount);
        } else {
          await transferSbd(stabilizerAccount, daoAccount, sbdBal.amount);
        }
      } else {
        const orderAmount = (Math.floor(sbdBal.amount * 1000 * bestOffer.base / bestOffer.quote) / 1000).toFixed(3);
        await createOrder(stabilizerAccount, `${sbdBal.amount.toFixed(3)} SBD`, `${orderAmount} STEEM`);
      }
    } else if (steemChunk >= 100) {
      if (printRate < 10000 || marketPrice > bestBid.real_price) {
        if (marketPrice > 1.06 * bestBid.real_price) {
          await convertSteemToSbd(stabilizerAccount, steemChunk);
        } else {
          await transferSteem(stabilizerAccount, daoAccount, steemChunk);
        }
      } else {
        const orderAmount = (Math.floor(steemChunk * 1000 * bestBid.base / bestBid.quote) / 1000).toFixed(3);
        await createOrder(stabilizerAccount, `${steemChunk.toFixed(3)} STEEM`, `${orderAmount} SBD`);
      }
    } else if (rewardSbd.amount > 0.1 || rewardSteem.amount > 0.1 || rewardVests.amount > 200) {
      // Claim rewards
      await claimRewards(stabilizerAccount, rewardSteem, rewardSbd, rewardVests);
    } else if (account.vesting_withdraw_rate === 0 && account.vesting_shares > 200) {
      await withdrawVesting(stabilizerAccount, account.vesting_shares);
    }

    await sleep(3000);
  }
}

// Function to convert SBD to STEEM
async function convertSbdToSteem(account, amount) {
  const operations = [
    ['convert', {
      owner: account,
      amount: `${amount.toFixed(3)} SBD`
    }]
  ];
  await client.broadcast.sendOperations(operations, account);
  console.log(`Converted ${amount.toFixed(3)} SBD to STEEM`);
}

async function transferSbd(fromAccount, toAccount, amount) {
  const operations = [
    ['transfer', {
      from: fromAccount,
      to: toAccount,
      amount: `${amount.toFixed(3)} SBD`,
      memo: ''
    }]
  ];
  await client.broadcast.sendOperations(operations, fromAccount);
  console.log(`Transferred ${amount.toFixed(3)} SBD from ${fromAccount} to ${toAccount}`);
}

async function convertSteemToSbd(account, amount) {
  const operations = [
    ['convert', {
      owner: account,
      amount: `${amount.toFixed(3)} STEEM`
    }]
  ];
  await client.broadcast.sendOperations(operations, account);
  console.log(`Converted ${amount.toFixed(3)} STEEM to SBD`);
}

async function transferSteem(fromAccount, toAccount, amount) {
  const operations = [
    ['transfer', {
      from: fromAccount,
      to: toAccount,
      amount: `${amount.toFixed(3)} STEEM`,
      memo: ''
    }]
  ];
  await client.broadcast.sendOperations(operations, fromAccount);
  console.log(`Transferred ${amount.toFixed(3)} STEEM from ${fromAccount} to ${toAccount}`);
}

async function createOrder(account, sellAmount, buyAmount) {
  const operations = [
    ['limit_order_create', {
      creator: account,
      amount_to_sell: sellAmount,
      min_to_receive: buyAmount,
      fill_or_kill: false,
      expiration: Math.floor(Date.now() / 1000) + 60 * 15
    }]
  ];
  await client.broadcast.sendOperations(operations, account);
  console.log(`Created an order: Sell ${sellAmount}, Buy ${buyAmount}`);
}

async function claimRewards(account, rewardSteem, rewardSbd, rewardVests) {
  const operations = [
    ['claim_reward_balance', {
      account: account,
      reward_steem: rewardSteem.amount.toFixed(3),
      reward_sbd: rewardSbd.amount.toFixed(3),
      reward_vests: rewardVests.amount.toFixed(3)
    }]
  ];
  await client.broadcast.sendOperations(operations, account);
  console.log(`Claimed rewards: ${rewardSteem.amount.toFixed(3)} STEEM, ${rewardSbd.amount.toFixed(3)} SBD, ${rewardVests.amount.toFixed(3)} VESTS`);
}

async function withdrawVesting(account, amount) {
  const operations = [
    ['withdraw_vesting', {
      account: account,
      vesting_shares: amount.toFixed(3)
    }]
  ];
  await client.broadcast.sendOperations(operations, account);
  console.log(`Withdrew ${amount.toFixed(3)} VESTS from ${account}`);
}

main().catch(console.error);

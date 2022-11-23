import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { PromisePool } from "@supercharge/promise-pool";
import keccak256 from "keccak256";

const PRICE = ethers.utils.parseEther("2");
const chunkSize = 10;

describe("NFTStaking Tests", function () {
  let rewardsContract: Contract;
  let nftContract: Contract;
  let stakingContract: Contract;
  let contractOwner: SignerWithAddress;
  let buyers: SignerWithAddress[];
  let IDENTITIES: {
    [x: string]: string;
  };

  beforeEach(async () => {
    [contractOwner, ...buyers] = await ethers.getSigners();

    const DAVYRewards = await ethers.getContractFactory(
      "DAVYRewards",
      contractOwner
    );

    rewardsContract = await DAVYRewards.deploy();
    await rewardsContract.deployed();

    const DAVYNFTContract = await ethers.getContractFactory(
      "DAVYNFT",
      contractOwner
    );

    nftContract = await DAVYNFTContract.deploy();
    await nftContract.deployed();

    const NFTStaking = await ethers.getContractFactory(
      "NFTStaking",
      contractOwner
    );

    stakingContract = await NFTStaking.deploy(
      nftContract.address,
      rewardsContract.address
    );
    await stakingContract.deployed();

    nftContract.setStakingContract(stakingContract.address);

    IDENTITIES = {
      [rewardsContract.address]: "REWARDS_CONTRACT_ADDRESS",
      [nftContract.address]: "NFT_CONTRACT_ADDRESS",
      [contractOwner.address]: "CONTRACT_OWNER",
      [stakingContract.address]: "STAKING_CONTRACT_ADDRESS",
    };

    buyers.forEach((buyer, index) => {
      IDENTITIES[buyer.address] = `BUYER_${index + 1}`;
    });
  });

  async function getBlockEarnings(
    daysToAdd: number,
    expectedEarnings: BigNumber
  ) {
    const contractStart = new Date(
      Number(await stakingContract.getContractStart())
    );
    const newDate = new Date(contractStart);

    newDate.setDate(contractStart.getDate() + daysToAdd);

    const amountInSeconds =
      (newDate.getTime() - contractStart.getTime()) / 1000;

    await ethers.provider.send("evm_increaseTime", [amountInSeconds]);
    await ethers.provider.send("evm_mine", []);

    const earnings =
      Math.floor(Number(await stakingContract.getEarningsForEra())) / 1e18;
    const expected = Number(expectedEarnings) / 1e18;
    const err = Math.abs((expected - earnings) / earnings);

    console.log(
      "era:",
      daysToAdd,
      "expectedEarnings:",
      expected,
      "actual earnings:",
      earnings,
      "err:",
      err
    );

    expect(err).to.be.lessThanOrEqual(
      0.001,
      `Unexpected earnings over ${daysToAdd} days.`
    );
  }

  it("Should return token description and symbol", async function () {
    expect(await rewardsContract.name()).to.equal(
      "Davy Jone's Locker rewards token"
    );
    expect(await rewardsContract.symbol()).to.equal("DAVR");
  });

  async function mintAndStake(
    buyer: SignerWithAddress,
    tokenHash: Buffer,
    runningHash: Buffer,
    index: number
  ) {
    console.log("staked token id:", index + 1);

    const mintTx = await nftContract
      .connect(buyer)
      .mint(index + 1, 984, tokenHash, runningHash, { value: PRICE });
    const mintTxReceipt = await mintTx.wait(1);
    const args = mintTxReceipt.events[2].args;
    const tokenId = Number(args.tokenId);

    await stakingContract.connect(buyer).stake([tokenId]);

    return { buyerAddress: buyer.address, tokenId };
  }

  // it("Stake many", async function () {
  //   this.timeout(Number.MAX_SAFE_INTEGER);

  //   await rewardsContract.addController(stakingContract.address);

  //   type BuyerMap = {
  //     buyerAddress: string;
  //     tokenId: number;
  //   };

  //   let totalStaked = 0;
  //   const tokensMinted = [] as BuyerMap[];
  //   const runningHashSeed = keccak256("this is a seed value;");
  //   let runningHash: Buffer = Buffer.alloc(0);

  //   await nftContract.initializeRollingTokenHash(runningHashSeed);

  //   for (let i = 0; i < buyers.length; i++) {
  //     const buyer = buyers[i];
  //     const tokenHash = keccak256(Buffer.from(`this is a test ${i + 1}`));

  //     if (i == 0) {
  //       runningHash = keccak256(Buffer.concat([runningHashSeed, tokenHash]));
  //     } else {
  //       runningHash = keccak256(Buffer.concat([runningHash, tokenHash]));
  //     }

  //     tokensMinted.push(await mintAndStake(buyer, tokenHash, runningHash, i));
  //   }

  //   expect([...new Set(tokensMinted.map((x) => x.tokenId))].length).to.equal(
  //     buyers.length
  //   );

  //   const stakedDays = 1 * 24 * 60 * 60;

  //   await ethers.provider.send("evm_increaseTime", [stakedDays]);
  //   await ethers.provider.send("evm_mine", []);
  //   const buyer = buyers[0];
  //   const tokenId = tokensMinted.filter(
  //     (x) => x.buyerAddress == buyer.address
  //   )[0].tokenId;

  //   console.log("unstaking", tokenId, "for buyer", buyer.address);

  //   await stakingContract.connect(buyers[0]).unstake([tokenId]);

  //   totalStaked = Number(await stakingContract.getTotalStaked());

  //   expect(totalStaked).to.equal(buyers.length - 1);
  // });

  it("Stake and unstake", async function () {
    console.time();

    await rewardsContract.addController(stakingContract.address);

    const buyerCount = buyers.length;
    const runningHashSeed = keccak256("this is a seed value;");
    let runningHash: Buffer = Buffer.alloc(0);
    const tokenIds = [] as number[];

    await nftContract.initializeRollingTokenHash(runningHashSeed);

    for (let i = 0; i < buyers.length; i++) {
      const tokenId = i + 1;
      const buyer = buyers[i];
      const tokenHash = keccak256(Buffer.from(`this is a test ${tokenId}`));

      if (i == 0) {
        runningHash = keccak256(Buffer.concat([runningHashSeed, tokenHash]));
      } else {
        runningHash = keccak256(Buffer.concat([runningHash, tokenHash]));
      }

      const token = await mintAndStake(buyer, tokenHash, runningHash, tokenId);

      let nftOwner = await nftContract.ownerOf(token.tokenId);

      tokenIds.push(token.tokenId);

      console.log("nftOwner:", nftOwner, "buyer:", buyer.address);

      expect(IDENTITIES[token.buyerAddress]).to.equal(
        IDENTITIES[buyer.address],
        "Token buyer address does not match buyer address."
      );
      expect(IDENTITIES[nftOwner]).to.equal(
        IDENTITIES[stakingContract.address],
        "NFT owner address does not NFT contract address."
      );
    }

    let totalStaked = Number(await stakingContract.getTotalStaked());

    // for (let i = 0; i < buyerCount; i++) {
    //   const buyer = buyers[i];
    //   const mintTx = await nftContract.connect(buyer).mint({ value: PRICE });
    //   const mintTxReceipt = await mintTx.wait(1);
    //   const args = mintTxReceipt.events[2].args;
    //   const tokenId = Number(args.tokenId);
    //   let nftOwner = await nftContract.ownerOf(tokenId);

    //   expect(IDENTITIES[nftOwner]).to.equal(IDENTITIES[buyer.address]);

    //   const stakeTx = await stakingContract.connect(buyer).stake([tokenId]);

    //   nftOwner = Number(await nftContract.ownerOf(tokenId));

    //   expect(IDENTITIES[nftOwner]).to.equal(
    //     IDENTITIES[stakingContract.address]
    //   );

    //   tokenIds[i] = tokenId;
    // }

    // console.timeEnd();

    // let totalStaked = Number(await stakingContract.getTotalStaked());

    expect(totalStaked).to.equal(buyerCount);

    const stakedDays = 1 * 24 * 60 * 60;

    await ethers.provider.send("evm_increaseTime", [stakedDays]);
    await ethers.provider.send("evm_mine", []);

    let actualPayout = 0;
    let earnings = Number(
      await stakingContract.connect(contractOwner).getEarningsForEra()
    );
    const setPayoutsTx = await stakingContract.setPayouts();
    const setPayoutsTxReciept = await setPayoutsTx.wait(1);

    setPayoutsTxReciept.events.forEach((event: any) => {
      actualPayout += Number(event.args.payout || 0);

      if (IDENTITIES[event.args.owner]) {
        console.log(
          IDENTITIES[event.args.owner],
          "payout:",
          Number(event.args.payout || 0)
        );
      }
    });

    console.log("earnings:", earnings, "actual payout:", actualPayout);

    expect(earnings).to.be.greaterThanOrEqual(0);
    expect(actualPayout).to.be.greaterThanOrEqual(0);
    expect(actualPayout).to.be.lessThanOrEqual(earnings);

    for (let i = 0; i < buyerCount; i++) {
      const buyer = buyers[i];
      const payout = await stakingContract.connect(buyer).getPayout();
    }

    earnings = Number(await stakingContract.getEarningsForEra());

    const tokenIdToUnstake = tokenIds[1];
    const owner = buyers[1];

    console.log("owner:", owner.address, "token:", tokenIdToUnstake);

    await stakingContract.connect(owner).unstake([tokenIdToUnstake]);

    totalStaked = Number(await stakingContract.getTotalStaked());

    expect(totalStaked).to.equal(buyerCount - 1);

    let buyerBalance = Number(await rewardsContract.balanceOf(owner.address));
    let owedToBuyer = Number(await stakingContract.connect(owner).getPayout());

    console.log(
      "Buyer's balance before claim:",
      buyerBalance,
      "Amount owed to buyer:",
      owedToBuyer
    );

    expect(Number(owedToBuyer)).to.be.greaterThan(0);
    expect(buyerBalance).to.equal(0);

    await stakingContract.connect(owner).claim();

    buyerBalance = Number(await rewardsContract.balanceOf(owner.address));
    owedToBuyer = Number(await stakingContract.connect(owner).getPayout());

    console.log(
      "Buyer's balance after claim:",
      buyerBalance,
      "Amount owed to buyer:",
      owedToBuyer
    );

    expect(buyerBalance).to.be.greaterThan(0);
    expect(owedToBuyer).to.equal(0);
  });

  it("Calculate rewards for period", async function () {
    const P0 = 750_000;
    const Ptotal = 500_000_000;
    const R = Ptotal / P0;
    const k = R - 1;

    for (let t = 60; t <= 14820; t += 60) {
      const expectedValue = P0 + P0 * k - P0 * k * Math.exp(-t / k);
      const actualValue = await stakingContract.calculateEarnings(
        t,
        P0,
        Ptotal
      );
      const diffPercent =
        (100 * (actualValue / 1e18 - expectedValue)) / expectedValue;

      expect(Math.abs(diffPercent)).to.be.lessThanOrEqual(
        2,
        `t: ${t}, expected: ${expectedValue}, actual: ${actualValue}, diff %: ${diffPercent}`
      );
    }
  });

  it("Calculate earnings distribution", async function () {
    const totalTokens = 200;
    let sum = 0;

    for (let i = 1; i <= totalTokens; i++) {
      sum += i;
    }

    for (let i = 0; i < totalTokens; i++) {
      const expectedValue = (totalTokens - i) / sum;
      const actualValue = await stakingContract.calculatePayoutRatio(
        i,
        totalTokens,
        sum
      );
      const diffPercent =
        (100 * (actualValue / 1e18 - expectedValue)) / expectedValue;

      expect(Math.abs(diffPercent)).to.be.lessThanOrEqual(
        0.1,
        `t: ${i}, expected: ${expectedValue}, actual: ${actualValue}, diff %: ${diffPercent}`
      );
    }
  });
});

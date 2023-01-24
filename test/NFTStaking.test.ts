import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import keccak256 from "keccak256";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";

let PRICE = 0;
const logOutput = Boolean(process.env.logOutput);

type ProvenanceHashItem = {
  tokenId: number;
  rarity: number;
  tokenHash: string;
  runningHash: string;
};

type ProvenanceHash = {
  seedHash: string;
  hashes: ProvenanceHashItem[];
};

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

    PRICE = Number(await nftContract.getPrice());
  });

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
    tokenId: number
  ) {
    const mintTx = await nftContract
      .connect(buyer)
      .mint(tokenId, 10000, tokenHash, runningHash, { value: PRICE });
    const mintTxReceipt = await mintTx.wait(1);
    const args = mintTxReceipt.events[2].args;
    const mintedTokenId = Number(args.tokenId);

    expect(mintedTokenId).to.equal(tokenId);

    await stakingContract.connect(buyer).stake([tokenId]);

    return { buyerAddress: buyer.address, tokenId };
  }

  function createProvidenceHash(tokenCount: number): ProvenanceHash {
    const tokenIds = Array(10000)
      .fill(0)
      .map((_, index) => index + 1);
    const shuffledTokenIds = tokenIds.sort((a, b) => 0.5 - Math.random());
    const rarities = Array(10000)
      .fill(0)
      .map((_, index) => index + 1);
    const shuffledRarities = rarities.sort((a, b) => 0.5 - Math.random());
    let runningHash = keccak256(uuidv4());

    const provenance: ProvenanceHash = {
      seedHash: runningHash.toString("hex"),
      hashes: [],
    };

    for (let i = 0; i < 10000; i++) {
      const tokenId = shuffledTokenIds[i];
      const rarity = shuffledRarities[i];
      const tokenHash = keccak256(
        Buffer.from(
          `${runningHash.toString("hex")}|${String(tokenId).padStart(
            5,
            "0"
          )}|${String(rarity).padStart(5, "0")}`
        )
      );

      runningHash = keccak256(Buffer.concat([runningHash, tokenHash]));

      provenance.hashes.push({
        tokenId,
        rarity,
        tokenHash: tokenHash.toString("hex"),
        runningHash: runningHash.toString("hex"),
      });
    }

    // Write the provenance hash to file so that it can be used for on chain testing.
    if (process.env.provenanceOutputPath) {
      const provenanceOut = JSON.parse(
        JSON.stringify(provenance)
      ) as ProvenanceHash;

      provenanceOut.seedHash = "0x" + provenanceOut.seedHash;

      provenanceOut.hashes.forEach((h) => {
        h.runningHash = "0x" + h.runningHash;
        h.tokenHash = "0x" + h.tokenHash;
      });

      const jsonData = JSON.stringify(provenanceOut, null, 2);

      fs.writeFile(
        String(process.env.provenanceOutputPath),
        jsonData,
        (err) => {
          if (err) {
            console.error(err);
          }
          // file written successfully
        }
      );
    }

    provenance.hashes = provenance.hashes.slice(0, tokenCount);

    return provenance;
  }

  it("Stake and unstake", async function () {
    const tokenIds = [] as number[];
    const buyerCount = buyers.length;
    const provenance = createProvidenceHash(buyerCount);

    console.time();

    await rewardsContract.addController(stakingContract.address);

    await nftContract.initializeRollingTokenHash(
      Buffer.from(provenance.seedHash, "hex")
    );

    for (let i = 0; i < buyers.length; i++) {
      const hash = provenance.hashes[i];
      const { tokenId } = hash;
      const tokenHash = Buffer.from(hash.tokenHash, "hex");
      const runningHash = Buffer.from(hash.runningHash, "hex");
      const buyer = buyers[i];
      const token = await mintAndStake(buyer, tokenHash, runningHash, tokenId);
      let nftOwner = await nftContract.ownerOf(token.tokenId);
      const lastMintedToken = Number(await nftContract.getLastMintedToken());

      if (logOutput) {
        console.log("nftOwner:", nftOwner, "buyer:", buyer.address);
      }

      expect(lastMintedToken).to.equal(tokenId);

      expect(IDENTITIES[token.buyerAddress]).to.equal(
        IDENTITIES[buyer.address],
        "Token buyer address does not match buyer address."
      );
      expect(IDENTITIES[nftOwner]).to.equal(
        IDENTITIES[stakingContract.address],
        "NFT owner address does not NFT contract address."
      );

      tokenIds.push(token.tokenId);
    }

    let totalStaked = Number(await stakingContract.getTotalStaked());
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

      if (logOutput) {
        if (IDENTITIES[event.args.owner]) {
          console.log(
            IDENTITIES[event.args.owner],
            "payout:",
            Number(event.args.payout || 0)
          );
        }
      }
    });

    if (logOutput) {
      console.log("earnings:", earnings, "actual payout:", actualPayout);
    }

    expect(earnings).to.be.greaterThanOrEqual(0);
    expect(actualPayout).to.be.greaterThanOrEqual(0);
    expect(actualPayout).to.be.lessThanOrEqual(earnings);

    let payout = 0;

    for (let i = 0; i < buyerCount; i++) {
      const buyer = buyers[i];
      payout += Number(await stakingContract.connect(buyer).getPayout());
    }

    expect(payout).to.be.greaterThanOrEqual(0);

    earnings = Number(await stakingContract.getEarningsForEra());

    const tokenIdToUnstake = tokenIds[1];
    const owner = buyers[1];

    if (logOutput) {
      console.log("owner:", owner.address, "token:", tokenIdToUnstake);
    }

    await stakingContract.connect(owner).unstake([tokenIdToUnstake]);

    totalStaked = Number(await stakingContract.getTotalStaked());

    expect(totalStaked).to.equal(buyerCount - 1);

    let buyerBalance = Number(await rewardsContract.balanceOf(owner.address));
    let owedToBuyer = Number(await stakingContract.connect(owner).getPayout());

    if (logOutput) {
      console.log(
        "Buyer's balance before claim:",
        buyerBalance,
        "Amount owed to buyer:",
        owedToBuyer
      );
    }

    expect(buyerBalance).to.equal(0);

    await stakingContract.connect(owner).claim();

    buyerBalance = Number(await rewardsContract.balanceOf(owner.address));
    owedToBuyer = Number(await stakingContract.connect(owner).getPayout());

    if (logOutput) {
      console.log(
        "Buyer's balance after claim:",
        buyerBalance,
        "Amount owed to buyer:",
        owedToBuyer
      );
    }

    expect(owedToBuyer).to.equal(0);

    const earningsAfterPayout = Number(
      await stakingContract.getEarningsForEra()
    );

    expect(earningsAfterPayout).to.be.lessThan(earnings)
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
    const totalTokens = 10000;
     const N = totalTokens;

    for (let i = 0; i < N; i++) {
      const expectedValue = (2 * N - 2 * i) / (N + N * N);
      const actualValue = await stakingContract.calculatePayoutRatio(i, N);

    

      const diffPercent =
        (100 * (actualValue / 1e18 - expectedValue)) / expectedValue;

      expect(Math.abs(diffPercent)).to.be.lessThanOrEqual(
        0.1,
        `t: ${i}, expected: ${expectedValue}, actual: ${actualValue / 1e18}, diff %: ${diffPercent}`
      );
    }
  });
});

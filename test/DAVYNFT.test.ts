import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import keccak256 from "keccak256";

let PRICE = 0;
const logOutput = Boolean(process.env.logOutput);

describe("DAVYNFT Tests", function () {
  let nftContract: Contract;
  let nftContractOwner: SignerWithAddress;
  let buyer: SignerWithAddress;
  let IDENTITIES: {
    [x: string]: string;
  };

  beforeEach(async () => {
    [buyer, nftContractOwner] = await ethers.getSigners();

    const DAVYNFTContract = await ethers.getContractFactory(
      "DAVYNFT",
      nftContractOwner
    );

    nftContract = await DAVYNFTContract.deploy();
    await nftContract.deployed();

    IDENTITIES = {
      [nftContractOwner.address]: "NFT_CONTRACT_OWNER",
      [nftContract.address]: "NFT_CONTRACT_ADDRESS",
      [buyer.address]: "BUYER",
    };

    PRICE = Number(await nftContract.getPrice());
  });

  it("Should return token description and symbol", async function () {
    expect(await nftContract.name()).to.equal("Davy Jone's Locker NFT");
    expect(await nftContract.symbol()).to.equal("DAVY");
  });

  it("Non-wwner cannot set baseurl", async function () {
    await expect(
      nftContract.connect(buyer).setBaseURI("urn://some-other-uri/")
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("Concatenate hash", async function () {
    let runningHash = Buffer.alloc(0);

    for (let i = 0; i <= 100; i++) {
      const value = keccak256(Buffer.from(`this is a test ${i}`));
      const actualHash = await nftContract
        .connect(nftContractOwner)
        .concatenateHash(
          i == 0
            ? ethers.constants.HashZero
            : "0x" + runningHash.toString("hex"),
          "0x" + value.toString("hex")
        );
      const expectedHash = keccak256(Buffer.concat([runningHash, value]));
      runningHash = expectedHash;

      if (logOutput) {
        console.log("expectedHash:", "0x" + expectedHash.toString("hex"));
        console.log("actual:      ", actualHash);
      }

      expect("0x" + expectedHash.toString("hex")).to.equal(actualHash);
    }
  });

  it("Calculate hash", async function () {
    let actualHash: any;
    let expectedHash: Buffer;
    let value: Buffer;

    value = Buffer.from(`this is a test ${0}`);
    actualHash = await nftContract
      .connect(nftContractOwner)
      .calculateHash(value);
    expectedHash = keccak256(value);

    expect("0x" + expectedHash.toString("hex")).to.equal(
      actualHash,
      "Initial hash comparison failed."
    );

    for (let i = 1; i < 20; i++) {
      value = Buffer.from(`this is a test ${i}`);
      expectedHash = keccak256(value);
      actualHash = await nftContract
        .connect(nftContractOwner)
        .calculateHash(value);

      expect("0x" + expectedHash.toString("hex")).to.equal(
        actualHash,
        `Hash for iteration ${i} failed.`
      );
    }
  });

  it("Mint", async function () {
    const runningHashSeed = keccak256("this is a seed value;");

    await nftContract.initializeRollingTokenHash(runningHashSeed);

    const tokenHash = keccak256(Buffer.from(`this is a test ${0}`));
    const runningHash = keccak256(Buffer.concat([runningHashSeed, tokenHash]));
    const buyerBalanceBefore = Number(
      await ethers.provider.getBalance(buyer.address)
    );
    const ownerBalanceBefore = Number(
      await ethers.provider.getBalance(nftContractOwner.address)
    );
    const mintTx = await nftContract
      .connect(buyer)
      .mint(1, 984, tokenHash, runningHash, { value: PRICE });
    const mintTxReceipt = await mintTx.wait(1);
    const args = mintTxReceipt.events[2].args;
    const seller = args.nftAddress;
    const buyerAddress = args.buyer;
    const tokenId = Number(args.tokenId);
    const buyerBalanceAfter = Number(
      await ethers.provider.getBalance(buyer.address)
    );
    const ownerBalanceAfter = Number(
      await ethers.provider.getBalance(nftContractOwner.address)
    );

    if (logOutput) {
      console.log(
        "buyer balance before:",
        buyerBalanceBefore,
        "after:",
        buyerBalanceAfter,
        "difference:",
        buyerBalanceAfter - buyerBalanceBefore
      );
      console.log(
        "owner balance before:",
        ownerBalanceBefore,
        "after:",
        ownerBalanceAfter,
        "difference:",
        ownerBalanceAfter - ownerBalanceBefore
      );
    }

    expect(IDENTITIES[buyerAddress]).to.equal("BUYER");
    expect(IDENTITIES[seller]).to.equal("NFT_CONTRACT_OWNER");
    expect(tokenId).to.equal(Number(1));

    const owner = await nftContract.ownerOf(tokenId);
    const buyerBalance = Number(await nftContract.balanceOf(buyer.address));

    expect(IDENTITIES[owner]).to.equal("BUYER");
    expect(buyerBalance).to.equal(1);
  });
});

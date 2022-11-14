import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

const PRICE = ethers.utils.parseEther("2");

describe("DAVYRewards Tests", function () {
  let rewardsContract: Contract;
  let contractOwner: SignerWithAddress;
  let IDENTITIES: {
    [x: string]: string;
  };

  beforeEach(async () => {
    [contractOwner] = await ethers.getSigners();

    const DAVYRewards = await ethers.getContractFactory(
        "DAVYRewards",
        contractOwner
      );

    rewardsContract = await DAVYRewards.deploy();

    IDENTITIES = {
      [rewardsContract.address]: "CONTRACT_ADDRESS",
      [contractOwner.address]: "CONTRACT_OWNER"
    };

    await rewardsContract.deployed();
  });

  it("Should return token description and symbol", async function () {
    expect(await rewardsContract.name()).to.equal(
      "Davy Jone's Locker rewards token"
    );
    expect(await rewardsContract.symbol()).to.equal("DAVR");
  });
});

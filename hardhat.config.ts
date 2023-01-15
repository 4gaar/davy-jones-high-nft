import "@nomiclabs/hardhat-ethers";
import { task } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-etherscan";
import { config } from "dotenv";
import "hardhat-gas-reporter";
// import hre from "hardhat";

config();

// import "hardhat-deploy";
// import "solidity-coverage";
// import "hardhat-contract-sizer";

const { privateKey } = require("./secrets.json");

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

task("deploy-nft-contract", "Deploys the NFT contract", async (_, hre) => {
  const DAVYNFT = await hre.ethers.getContractFactory("DAVYNFT");
  const nftContract = await DAVYNFT.deploy();

  await nftContract.deployed();

  console.log("DAVYNFT deployed to:", nftContract.address);

  await hre.run("verify:verify", { address: nftContract.address });  
});

task(
  "deploy-rewards-contract",
  "Deploys the staking rewards contract",
  async (_, hre) => {
    const DAVYRewards = await hre.ethers.getContractFactory("DAVYRewards");
    const rewardsContract = await DAVYRewards.deploy();

    await rewardsContract.deployed();

    console.log("DAVYRewards deployed to:", rewardsContract.address);

    await hre.run("verify:verify", { address: rewardsContract.address });    
  }
);

task("deploy-staking-contract", "Prints an account's balance")
  .addParam("nftContractAddress", "The NFT contract address")
  .addParam("rewardsContractAddress", "The rewards contract address")
  .setAction(async (taskArgs, hre) => {
    const nftContractArtifact = await hre.artifacts.readArtifact("DAVYNFT");
    const nftContract = await hre.ethers.getContractAtFromArtifact(
      nftContractArtifact,
      taskArgs.nftContractAddress
    );

    const NFTStaking = await hre.ethers.getContractFactory("NFTStaking");
    const stakingContract = await NFTStaking.deploy(
      taskArgs.nftContractAddress,
      taskArgs.rewardsContractAddress
    );

    await stakingContract.deployed();
    await nftContract.setStakingContract(stakingContract.address);

    console.log("NFTStaking contract deployed to:", stakingContract.address);

    await hre.run("verify:verify", {
      address: stakingContract.address,
      constructorArguments: [
        taskArgs.nftContractAddress,
        taskArgs.rewardsContractAddress,
      ],
    });
  });

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: "0.8.17",
  etherscan: {
    apiKey: {
      moonbaseAlpha: process.env.moonbaseAlphaApiKey,
    },
  },
  networks: {
    hardhat: {
      chainId: 1337,
      // accounts: {
      //   count: 51
      // },
      // mining: {
      //   auto: false,
      //   interval: 1000

      //   // mempool: {
      //   //   order: "fifo"
      //   // }
      // }
    },
    moonbase: {
      url: "https://rpc.api.moonbase.moonbeam.network",
      chainId: 1287, // (hex: 0x507),
      accounts: [privateKey],
    },
  },
};

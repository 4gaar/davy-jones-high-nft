// require("@nomiclabs/hardhat-etherscan");
import "@nomiclabs/hardhat-etherscan";
import retry from "async-retry";

import hre from "hardhat";

async function main() {
  const DAVYNFT = await hre.ethers.getContractFactory("DAVYNFT");
  const nftContract = await DAVYNFT.deploy();

  await nftContract.deployed();

  console.log("DAVYNFT deployed to:", nftContract.address);

  // const DAVYRewards = await hre.ethers.getContractFactory("DAVYRewards");
  // const rewardsContract = await DAVYRewards.deploy();

  // await rewardsContract.deployed();
  // console.log("DAVYRewards deployed to:", rewardsContract.address);

  // const NFTStaking = await hre.ethers.getContractFactory("NFTStaking");
  // const stakingContract = await NFTStaking.deploy(
  //   nftContract.address,
  //   rewardsContract.address
  // );

  // await stakingContract.deployed();
  // console.log("NFTStaking deployed to:", stakingContract.address);

  // await nftContract.setStakingContract(stakingContract.address);

  // console.log("DAVYNFT staking contract set to:", stakingContract.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

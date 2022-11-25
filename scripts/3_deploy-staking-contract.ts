// require("@nomiclabs/hardhat-etherscan");
import "@nomiclabs/hardhat-etherscan";
import retry from "async-retry";

import hre from "hardhat";

async function main(args?: any[]) {

  console.log('args', args)

  const nftContractAddress = '0x0c57E7C3F175827275ba97336544a49C27E94273'
  const nftContractArtifact = await hre.artifacts.readArtifact("DAVYNFT");
  const nftContract = await hre.ethers.getContractAtFromArtifact(nftContractArtifact, nftContractAddress)
  
  const rewardsContractAddress = '0xF45ebB6e1c1F4a7C70ace3D686dCD79c9e1512d4'
  // const rewardsContractArtifact = await hre.artifacts.readArtifact("DAVYRewards");
  // const rewardsContract = await hre.ethers.getContractAtFromArtifact(rewardsContractArtifact, rewardsContractAddress)

  const NFTStaking = await hre.ethers.getContractFactory("NFTStaking");
  const stakingContract = await NFTStaking.deploy(
    nftContractAddress,
    rewardsContractAddress
  );

  await stakingContract.deployed();
  console.log("NFTStaking deployed to:", stakingContract.address);

  await nftContract.setStakingContract(stakingContract.address);

  console.log("DAVYNFT staking contract set to:", stakingContract.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

import "@nomiclabs/hardhat-etherscan";
import hre from "hardhat";

async function main() {
    const DAVYRewards = await hre.ethers.getContractFactory("DAVYRewards");
  const rewardsContract = await DAVYRewards.deploy();

  await rewardsContract.deployed();
  console.log("DAVYRewards deployed to:", rewardsContract.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

const path = require('path');
const { runTests } = require('vscode-test');

async function main() {
	try {
		// 包含扩展清单 package.json 的文件夹
		// 传递给 --extensionDevelopmentPath
		const extensionDevelopmentPath = path.resolve(__dirname, '../');

		// 扩展测试脚本的路径
		// 传递给 --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './index.js');

		// 下载 VS Code，解压缩并运行集成测试
		await runTests({ extensionDevelopmentPath, extensionTestsPath });
	} catch (err) {
		console.error('运行测试失败');
		process.exit(1);
	}
}

main();
const assert = require('assert');
const vscode = require('vscode');

// 测试套件
suite('扩展测试套件', () => {
	vscode.window.showInformationMessage('开始所有测试。');

	// 示例测试
	test('示例测试', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});
});
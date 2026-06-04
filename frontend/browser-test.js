
/**
 * 可以直接在浏览器控制台运行的测试脚本！
 * 
 * 用法：
 * 1. 打开浏览器访问 http://localhost:3000
 * 2. 按 F12 打开开发者工具
 * 3. 切换到 Console 标签
 * 4. 复制这个文件的全部内容，粘贴进去，按回车
 */

(async function BasketMateQuickTest() {
  console.log('%c🎯 BasketMate 快速测试', 'font-size: 20px; font-weight: bold; color: #00cc00;');
  console.log('%c='.repeat(60), 'color: #666;');

  const API_BASE = 'http://127.0.0.1:8000';
  const results = [];

  async function testApi(name, method, path, body) {
    console.log(`\n%c🔍 测试: ${name}`, 'font-weight: bold; color: #0066cc;');
    console.log(`   ${method} ${API_BASE}${path}`);
    
    try {
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
      };
      if (body) {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(`${API_BASE}${path}`, options);
      const data = await response.json();

      console.log(`   状态码: %c${response.status}`, response.ok ? 'color: #00cc00;' : 'color: #cc0000;');
      
      // 验证格式
      const hasFormat = 'success' in data && 'message' in data && 'data' in data;
      const statusMatch = response.ok ? data.success : !data.success;

      let color = 'color: #00cc00;';
      let status = '✅ 通过';
      if (!hasFormat || !statusMatch) {
        color = 'color: #cc0000;';
        status = '❌ 失败';
      }

      console.log(`   格式: %c${hasFormat ? '✅ 正确' : '❌ 缺少字段'}`, hasFormat ? 'color: #00cc00;' : 'color: #cc0000;');
      console.log(`   状态: %c${statusMatch ? '✅ 匹配' : '❌ 不匹配'}`, statusMatch ? 'color: #00cc00;' : 'color: #cc0000;');
      console.log(`   响应:`, data);

      results.push({
        name,
        status: response.status,
        hasFormat,
        statusMatch,
        data
      });

    } catch (error) {
      console.log(`   ❌ 错误: ${error.message}`);
      results.push({
        name,
        status: -1,
        hasFormat: false,
        statusMatch: false,
        error: error.message
      });
    }
  }

  // 测试列表
  const tests = [
    { name: '根路径', method: 'GET', path: '/' },
    { name: '健康检查', method: 'GET', path: '/api/health' },
    { name: '获取食材', method: 'GET', path: '/api/ingredients' },
    { name: '获取菜谱', method: 'GET', path: '/api/recipes' },
    { name: '获取计划', method: 'GET', path: '/api/plans' },
    { name: '获取价格', method: 'GET', path: '/api/prices' },
    { name: '获取店铺', method: 'GET', path: '/api/shops' },
    { name: '获取采购任务', method: 'GET', path: '/api/shopping/task' },
    { name: '获取用户画像', method: 'GET', path: '/api/user/profile' },
    { name: '获取黑名单', method: 'GET', path: '/api/blacklist' },
    { name: '获取导入记录', method: 'GET', path: '/api/import/records' },
    { name: '创建测试食材', method: 'POST', path: '/api/ingredients', body: { name: '快速测试食材', quantity: 99 } },
    { name: '创建测试计划', method: 'POST', path: '/api/plans', body: { date: '2099-12-31', breakfast_recipe_id: null, meal_ids: [] } },
  ];

  for (const test of tests) {
    await testApi(test.name, test.method, test.path, test.body);
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  // 总结
  console.log('\n' + '%c='.repeat(60), 'color: #666;');
  console.log('%c📊 测试总结', 'font-size: 18px; font-weight: bold; color: #0066cc;');

  const total = results.length;
  const passedFormat = results.filter(r => r.hasFormat).length;
  const passedStatus = results.filter(r => r.statusMatch).length;
  const allPassed = passedFormat === total && passedStatus === total;

  console.log(`\n总测试数: ${total}`);
  console.log(`格式正确: %c${passedFormat}/${total}`, passedFormat === total ? 'color: #00cc00;' : 'color: #cc0000;');
  console.log(`状态匹配: %c${passedStatus}/${total}`, passedStatus === total ? 'color: #00cc00;' : 'color: #cc0000;');

  if (allPassed) {
    console.log('\n%c🎉 太棒了！所有测试通过！', 'font-size: 24px; font-weight: bold; color: #00cc00;');
  } else {
    console.log('\n%c⚠️ 有测试失败，请检查下面的失败项：', 'font-size: 16px; font-weight: bold; color: #cc0000;');
    results.filter(r => !r.hasFormat || !r.statusMatch).forEach(r => {
      console.log(`   ❌ ${r.name}`);
    });
  }

  console.log('\n%c测试完成！', 'font-weight: bold; color: #00cc00;');
  return results;
})();


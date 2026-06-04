
const BASE_URL = 'http://127.0.0.1:8000';

async function makeRequest(method, path, body) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${BASE_URL}${path}`, options);
    const data = await response.json();
    return {
      success: response.ok,
      status: response.status,
      data,
      error: null
    };
  } catch (error) {
    return {
      success: false,
      status: -1,
      data: null,
      error: error.message
    };
  }
}

function validateResponse(result) {
  const { success, status, data, error } = result;
  const hasData = data !== null;
  
  // 检查格式
  const validFormat = hasData && 
    typeof data === 'object' && 
    'success' in data && 
    'message' in data && 
    'data' in data;
  
  // 检查状态码与 success 字段匹配
  let statusMatch = true;
  if (validFormat) {
    const is2xx = status >= 200 && status < 300;
    if (is2xx && !data.success) {
      statusMatch = false;
    }
  }

  return {
    validFormat,
    statusMatch,
    is2xx: status >= 200 && status < 300
  };
}

async function testEndpoint(name, method, path, body) {
  console.log(`\n🔍 测试: ${name}`);
  console.log(`   ${method} ${path}`);
  
  const result = await makeRequest(method, path, body);
  const validation = validateResponse(result);
  
  console.log(`   状态码: ${result.status}`);
  console.log(`   响应:`, JSON.stringify(result.data, null, 2).substring(0, 500));
  console.log(`   格式验证: ${validation.validFormat ? '✅ 通过' : '❌ 失败'}`);
  console.log(`   状态匹配: ${validation.statusMatch ? '✅ 通过' : '❌ 失败'}`);
  
  return {
    name,
    method,
    path,
    ...result,
    ...validation
  };
}

async function runAllTests() {
  console.log('='.repeat(80));
  console.log('🎯 BasketMate 统一 API 格式自动化测试');
  console.log('='.repeat(80));

  const testCases = [
    // 根路径和健康检查
    { name: '根路径', method: 'GET', path: '/' },
    { name: '健康检查', method: 'GET', path: '/api/health' },

    // 食材
    { name: '获取食材列表', method: 'GET', path: '/api/ingredients' },
    { name: '创建食材', method: 'POST', path: '/api/ingredients', body: { name: '测试食材', quantity: 0 } },

    // 菜谱
    { name: '获取菜谱列表', method: 'GET', path: '/api/recipes' },

    // 计划
    { name: '获取计划列表', method: 'GET', path: '/api/plans' },
    { name: '创建计划', method: 'POST', path: '/api/plans', body: { date: '2099-12-31', breakfast_recipe_id: null, meal_ids: [] } },

    // 价格和店铺
    { name: '获取价格列表', method: 'GET', path: '/api/prices' },
    { name: '获取店铺列表', method: 'GET', path: '/api/shops' },

    // 采购任务
    { name: '获取采购任务', method: 'GET', path: '/api/shopping/task' },

    // 用户画像
    { name: '获取用户画像', method: 'GET', path: '/api/user/profile' },

    // 黑名单
    { name: '获取黑名单', method: 'GET', path: '/api/blacklist' },

    // 导入记录
    { name: '获取导入记录', method: 'GET', path: '/api/import/records' },

    // 测试参数验证错误
    { name: '参数验证错误', method: 'POST', path: '/api/ingredients', body: { invalid_field: 'test' } },
  ];

  const results = [];
  for (const testCase of testCases) {
    const result = await testEndpoint(testCase.name, testCase.method, testCase.path, testCase.body);
    results.push(result);
    // 稍微延迟一下，避免请求太快
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // 打印总结
  console.log('\n' + '='.repeat(80));
  console.log('📊 测试总结');
  console.log('='.repeat(80));
  
  const passedFormat = results.filter(r => r.validFormat).length;
  const totalFormat = results.length;
  
  const passedStatus = results.filter(r => r.statusMatch).length;
  const totalStatus = results.length;
  
  console.log(`\n格式验证: ${passedFormat}/${totalFormat} 个通过`);
  console.log(`状态匹配: ${passedStatus}/${totalStatus} 个通过`);
  
  console.log('\n❌ 失败的测试:');
  for (const result of results) {
    if (!result.validFormat || !result.statusMatch) {
      console.log(`   - ${result.name}: ${!result.validFormat ? '格式错误' : ''} ${!result.statusMatch ? '状态不匹配' : ''}`);
    }
  }

  const allPassed = passedFormat === totalFormat && passedStatus === totalStatus;
  console.log(`\n${allPassed ? '🎉 所有测试通过！' : '⚠️ 有测试失败，请检查！'}`);

  return allPassed ? 0 : 1;
}

// 运行测试
if (typeof require !== 'undefined' && require.main === module) {
  const url = require('url');
  const { fetch: nodeFetch } = require('undici');
  
  // 兼容 Node.js 环境
  if (typeof fetch === 'undefined') {
    global.fetch = nodeFetch;
  }
  
  runAllTests()
    .then(exitCode => process.exit(exitCode))
    .catch(error => {
      console.error('❌ 测试运行失败:', error);
      process.exit(1);
    });
} else {
  runAllTests();
}


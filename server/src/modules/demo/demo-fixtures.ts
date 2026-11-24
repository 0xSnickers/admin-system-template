/** 演示数据的素材：页面、来源、UA、埋点、异常、接口。 */
export const ORIGIN = 'https://shop.example.com';
export const PAGES: [string, number][] = [
  ['/', 30],
  ['/products', 22],
  ['/products/42', 14],
  ['/products/7', 9],
  ['/cart', 10],
  ['/checkout', 5],
  ['/search', 6],
  ['/login', 4],
  ['/account/orders', 3],
  ['/help', 2],
];
export const REFERRERS: [string, number][] = [
  ['', 45],
  ['https://www.google.com/', 20],
  ['https://www.baidu.com/s?wd=shop', 15],
  ['https://weixin.qq.com/', 10],
  ['https://github.com/', 5],
  ['https://news.ycombinator.com/', 5],
];
export const AGENTS: [string, number][] = [
  [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    34,
  ],
  [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    14,
  ],
  [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    20,
  ],
  [
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
    14,
  ],
  [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0',
    8,
  ],
  ['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 5],
  [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50',
    5,
  ],
];
export const TRACKS: [string, number][] = [
  ['product_view', 30],
  ['add_to_cart', 18],
  ['search_submit', 14],
  ['checkout_start', 8],
  ['purchase_success', 5],
  ['coupon_apply', 4],
  ['signup_success', 3],
  ['share_click', 3],
];
export const ERRORS: {
  weight: number;
  type: string;
  message: string;
  stack: string;
  path: string;
}[] = [
  {
    weight: 30,
    type: 'js',
    message: "TypeError: Cannot read properties of undefined (reading 'price')",
    stack:
      "TypeError: Cannot read properties of undefined (reading 'price')\n    at CartItem (https://shop.example.com/assets/index-3f2a.js:1:48211)\n    at renderWithHooks (https://shop.example.com/assets/vendor-91c.js:1:22011)",
    path: '/cart',
  },
  {
    weight: 18,
    type: 'promise',
    message: 'Unhandled rejection: Network Error',
    stack:
      'AxiosError: Network Error\n    at XMLHttpRequest.onerror (https://shop.example.com/assets/vendor-91c.js:2:1201)',
    path: '/checkout',
  },
  { weight: 14, type: 'api', message: 'POST /api/orders 500', stack: '', path: '/checkout' },
  {
    weight: 10,
    type: 'resource',
    message: 'Failed to load image: https://cdn.example.com/img/banner-autumn.webp',
    stack: '',
    path: '/',
  },
  {
    weight: 9,
    type: 'js',
    message: 'ReferenceError: gtag is not defined',
    stack:
      'ReferenceError: gtag is not defined\n    at trackPurchase (https://shop.example.com/assets/index-3f2a.js:1:90122)',
    path: '/checkout',
  },
  {
    weight: 7,
    type: 'js',
    message: 'ChunkLoadError: Loading chunk 381 failed.',
    stack:
      'ChunkLoadError: Loading chunk 381 failed.\n    at __webpack_require__.f.j (https://shop.example.com/assets/runtime.js:1:3011)',
    path: '/products/42',
  },
  { weight: 5, type: 'api', message: 'GET /api/products/7 404', stack: '', path: '/products/7' },
  {
    weight: 4,
    type: 'js',
    message: "TypeError: Failed to execute 'observe' on 'IntersectionObserver'",
    stack:
      "TypeError: Failed to execute 'observe' on 'IntersectionObserver'\n    at LazyImage (https://shop.example.com/assets/index-3f2a.js:1:61002)",
    path: '/products',
  },
];
export const APIS: [string, string, number][] = [
  ['GET', '/api/products', 30],
  ['GET', '/api/products/42', 15],
  ['GET', '/api/cart', 18],
  ['POST', '/api/cart/items', 10],
  ['GET', '/api/search', 10],
  ['POST', '/api/orders', 5],
  ['POST', '/api/auth/login', 4],
  ['GET', '/api/account/orders', 8],
];

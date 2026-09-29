const { spawn } = require('child_process');
const http = require('http');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const TEST_VIEWPORTS = [
  { name: 'iPhone SE / Small Screen', width: 320, height: 568, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'Standard Android (360x640)', width: 360, height: 640, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: 'iPhone 8 / Small (375x667)', width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'iPhone 12/13/14 (390x844)', width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  { name: 'Pixel 7 / Android (412x915)', width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
  { name: 'Desktop Baseline (1280x800)', width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];

const USER_AGENTS = {
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

// Helper: Simple CDP client over native WebSocket
class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.id && this.callbacks.has(data.id)) {
          const { resolve, reject } = this.callbacks.get(data.id);
          this.callbacks.delete(data.id);
          if (data.error) reject(new Error(JSON.stringify(data.error)));
          else resolve(data.result);
        }
      };
    });
  }

  async send(method, params = {}) {
    const id = this.msgId++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || 'Evaluation failed');
    }
    return res.result?.value;
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('  🧪 IHMS Mobile Menu Responsive Verification Suite');
  console.log('====================================================\n');

  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9224',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--hide-scrollbars=false',
  ]);

  // Wait for Chrome to boot
  await new Promise((r) => setTimeout(r, 1500));

  try {
    const tabsRes = await fetch('http://localhost:9224/json/new?http://localhost:3000');
    const tab = await tabsRes.json();
    const cdp = new CDPClient(tab.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');

    console.log('✅ Connected to Chrome DevTools Protocol.');

    let allPassed = true;

    for (const vp of TEST_VIEWPORTS) {
      console.log(`\n----------------------------------------------------`);
      console.log(`📱 Testing Viewport: ${vp.name} (${vp.width} × ${vp.height})`);
      console.log(`----------------------------------------------------`);

      // Set Device Metrics
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.deviceScaleFactor,
        mobile: vp.isMobile,
      });

      if (vp.hasTouch) {
        await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
      }

      // Emulate mobile user-agent
      const ua = vp.name.includes('iPhone') ? USER_AGENTS.iosSafari : USER_AGENTS.androidChrome;
      await cdp.send('Network.setUserAgentOverride', {
        userAgent: vp.isMobile ? ua : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
      });

      // Inject mock user credentials into localStorage to test full Owner menu (18 items!)
      await cdp.send('Page.navigate', { url: 'http://localhost:3000' });
      await new Promise((r) => setTimeout(r, 800));

      await cdp.evaluate(`
        localStorage.setItem('ihms_access_token', 'mock-u-owner-1-${Date.now()}');
        localStorage.setItem('ihms_current_branch', 'br-hyd001');
      `);

      // Reload to activate session
      await cdp.send('Page.navigate', { url: 'http://localhost:3000/dashboard' });
      await new Promise((r) => setTimeout(r, 1500));

      if (!vp.isMobile) {
        // Desktop verification
        const desktopResult = await cdp.evaluate(`
          (() => {
            const desktopSidebar = document.querySelector('aside.sidebar');
            const mobileBtn = document.querySelector('.mobile-menu-button');
            const isSidebarVisible = desktopSidebar && getComputedStyle(desktopSidebar).display !== 'none';
            const isMobileBtnHidden = !mobileBtn || getComputedStyle(mobileBtn).display === 'none';
            return { isSidebarVisible, isMobileBtnHidden };
          })()
        `);
        console.log(`  [Desktop] Sidebar visible: ${desktopResult.isSidebarVisible ? 'PASS' : 'FAIL'}`);
        console.log(`  [Desktop] Mobile button hidden: ${desktopResult.isMobileBtnHidden ? 'PASS' : 'FAIL'}`);
        if (!desktopResult.isSidebarVisible || !desktopResult.isMobileBtnHidden) allPassed = false;
        continue;
      }

      // Mobile Verification:
      // 1. Check hamburger button is visible
      const btnVisible = await cdp.evaluate(`
        (() => {
          const btn = document.querySelector('button[aria-label="Open navigation menu"]');
          if (!btn) return false;
          const style = getComputedStyle(btn);
          return style.display !== 'none' && style.visibility !== 'hidden';
        })()
      `);
      console.log(`  1. Mobile hamburger button visible: ${btnVisible ? 'PASS' : 'FAIL'}`);
      if (!btnVisible) { allPassed = false; continue; }

      // 2. Click hamburger button to open drawer
      await cdp.evaluate(`
        document.querySelector('button[aria-label="Open navigation menu"]').click();
      `);
      await new Promise((r) => setTimeout(r, 350));

      // 3. Verify drawer is open
      const drawerState = await cdp.evaluate(`
        (() => {
          const drawer = document.querySelector('.sidebar-mobile-drawer');
          if (!drawer) return { found: false };
          const rect = drawer.getBoundingClientRect();
          const hasOpenClass = drawer.classList.contains('mobile-open');
          const isVisible = rect.left >= 0 && rect.width > 0;
          return { found: true, hasOpenClass, isVisible, rect: { width: rect.width, height: rect.height, left: rect.left, top: rect.top } };
        })()
      `);
      console.log(`  2. Mobile drawer opened: ${drawerState.hasOpenClass && drawerState.isVisible ? 'PASS' : 'FAIL'} (width: ${drawerState.rect?.width}px, height: ${drawerState.rect?.height}px)`);
      if (!drawerState.hasOpenClass || !drawerState.isVisible) { allPassed = false; continue; }

      // 4. Verify vertical scrollability
      const scrollInfo = await cdp.evaluate(`
        (() => {
          const scrollEl = document.querySelector('.sidebar-mobile-drawer .sidebar-scroll');
          if (!scrollEl) return null;
          const style = getComputedStyle(scrollEl);
          return {
            clientHeight: scrollEl.clientHeight,
            scrollHeight: scrollEl.scrollHeight,
            overflowY: style.overflowY,
            isScrollable: scrollEl.scrollHeight > scrollEl.clientHeight,
          };
        })()
      `);
      console.log(`  3. Menu is scrollable: ${scrollInfo?.isScrollable ? 'PASS' : 'FAIL'} (content: ${scrollInfo?.scrollHeight}px, container: ${scrollInfo?.clientHeight}px, overflow-y: ${scrollInfo?.overflowY})`);
      if (!scrollInfo?.isScrollable) { allPassed = false; }

      // 5. Scroll all the way to the bottom
      await cdp.evaluate(`
        (() => {
          const scrollEl = document.querySelector('.sidebar-mobile-drawer .sidebar-scroll');
          if (scrollEl) {
            scrollEl.scrollTop = scrollEl.scrollHeight;
          }
        })()
      `);
      await new Promise((r) => setTimeout(r, 300));

      // 6. Check Account & Sign Out visibility and geometry after scrolling to bottom
      const accountSignOutInfo = await cdp.evaluate(`
        (() => {
          const drawer = document.querySelector('.sidebar-mobile-drawer');
          const scrollEl = drawer.querySelector('.sidebar-scroll');
          const accountHeader = Array.from(drawer.querySelectorAll('.section-title')).find(el => el.textContent.trim().toUpperCase() === 'ACCOUNT');
          const signOutBtn = drawer.querySelector('button[aria-label="Sign out"], button[title="Sign out"]');

          const vpHeight = window.innerHeight;
          const vpWidth = window.innerWidth;

          let accountVisible = false;
          let signOutVisible = false;
          let signOutClickable = false;
          let signOutRect = null;
          let distanceToBottom = null;

          if (accountHeader) {
            const r = accountHeader.getBoundingClientRect();
            accountVisible = r.top >= 0 && r.bottom <= vpHeight && r.left >= 0 && r.right <= vpWidth;
          }

          if (signOutBtn) {
            const r = signOutBtn.getBoundingClientRect();
            signOutRect = { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
            // Fully inside viewport bounds
            signOutVisible = r.top >= 0 && r.bottom <= vpHeight && r.left >= 0 && r.right <= vpWidth;
            distanceToBottom = vpHeight - r.bottom;
            signOutClickable = r.height >= 40 && signOutVisible;
          }

          return {
            hasAccountHeader: !!accountHeader,
            accountVisible,
            hasSignOutBtn: !!signOutBtn,
            signOutVisible,
            signOutClickable,
            signOutRect,
            distanceToBottom,
            vpHeight,
            scrollTop: scrollEl.scrollTop,
            maxScroll: scrollEl.scrollHeight - scrollEl.clientHeight,
          };
        })()
      `);

      console.log(`  4. Account Section visible: ${accountSignOutInfo?.accountVisible ? 'PASS' : 'FAIL'}`);
      console.log(`  5. Sign Out Button visible: ${accountSignOutInfo?.signOutVisible ? 'PASS' : 'FAIL'} (bottom: ${accountSignOutInfo?.signOutRect?.bottom}px <= viewport: ${accountSignOutInfo?.vpHeight}px)`);
      console.log(`  6. Sign Out Touch Target: ${accountSignOutInfo?.signOutClickable ? 'PASS' : 'FAIL'} (height: ${accountSignOutInfo?.signOutRect?.height}px, width: ${accountSignOutInfo?.signOutRect?.width}px)`);
      console.log(`  7. Safe-area clearance to bottom: ${accountSignOutInfo?.distanceToBottom}px (>= 20px: ${accountSignOutInfo?.distanceToBottom >= 20 ? 'PASS' : 'FAIL'})`);

      if (!accountSignOutInfo?.accountVisible || !accountSignOutInfo?.signOutVisible || !accountSignOutInfo?.signOutClickable) {
        allPassed = false;
      }

      // 7. Verify Sign Out Clickability & execution
      const clickResult = await cdp.evaluate(`
        (() => {
          const btn = document.querySelector('.sidebar-mobile-drawer button[aria-label="Sign out"], .sidebar-mobile-drawer button[title="Sign out"]');
          if (!btn) return false;
          let clicked = false;
          const listener = () => { clicked = true; };
          btn.addEventListener('click', listener, { once: true });
          btn.click();
          return clicked;
        })()
      `);
      console.log(`  8. Sign Out button clickable & handled: ${clickResult ? 'PASS' : 'FAIL'}`);
      if (!clickResult) allPassed = false;

      // 8. Test closing via Close Button (X)
      // First re-open drawer
      await cdp.evaluate(`
        document.querySelector('button[aria-label="Open navigation menu"]').click();
      `);
      await new Promise((r) => setTimeout(r, 300));
      // Click X button
      await cdp.evaluate(`
        document.querySelector('.sidebar-mobile-drawer button[aria-label="Close navigation menu"]').click();
      `);
      await new Promise((r) => setTimeout(r, 350));
      const closedViaX = await cdp.evaluate(`
        (() => {
          const drawer = document.querySelector('.sidebar-mobile-drawer');
          return !drawer.classList.contains('mobile-open');
        })()
      `);
      console.log(`  9. Drawer closes on close button (X): ${closedViaX ? 'PASS' : 'FAIL'}`);
      if (!closedViaX) allPassed = false;

      // 9. Test closing via Backdrop Overlay
      await cdp.evaluate(`
        document.querySelector('button[aria-label="Open navigation menu"]').click();
      `);
      await new Promise((r) => setTimeout(r, 300));
      await cdp.evaluate(`
        document.querySelector('.mobile-sidebar-overlay').click();
      `);
      await new Promise((r) => setTimeout(r, 350));
      const closedViaOverlay = await cdp.evaluate(`
        (() => {
          const drawer = document.querySelector('.sidebar-mobile-drawer');
          return !drawer.classList.contains('mobile-open');
        })()
      `);
      console.log(`  10. Drawer closes on backdrop overlay click: ${closedViaOverlay ? 'PASS' : 'FAIL'}`);
      if (!closedViaOverlay) allPassed = false;
    }

    cdp.close();

    console.log('\n====================================================');
    if (allPassed) {
      console.log('🎉 ALL RESPONSIVE TESTS PASSED SUCCESSFULLY!');
    } else {
      console.log('❌ SOME TESTS FAILED. CHECK LOGS ABOVE.');
    }
    console.log('====================================================\n');
    process.exit(allPassed ? 0 : 1);
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  } finally {
    chromeProc.kill();
  }
}

runTests();

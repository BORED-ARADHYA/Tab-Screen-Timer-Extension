let tabTimes = {};
let currentTabId = null;
let startTime = null;
let currentSession = {
  url: null,
  startTime: null
};
let categoryTimes = {};
const SITE_LIMITS = {
  'facebook.com': 30,
  'youtube.com': 60
};
const SITE_CATEGORIES = {
  'youtube.com': 'Entertainment',
  'github.com': 'Work',
  'gmail.com': 'Communication'
};
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const newTabId = activeInfo.tabId;
    if (currentTabId) {
      updateTimeForTab(currentTabId);
    }
    currentTabId = newTabId;
    startTime = Date.now();
    chrome.tabs.get(newTabId, (tab) => {
      if (chrome.runtime.lastError) return;
      if (tab.url === 'chrome://newtab/' || tab.url.startsWith('chrome://')) {
        currentSession = {
          url: null,
          startTime: null
        };
      } else {
        try {
          currentSession = {
            url: new URL(tab.url).hostname,
            startTime: Date.now()
          };
        } catch (e) {
          currentSession = {
            url: null,
            startTime: null
          };
        }
      }
    });
  } catch (error) {
    console.error('Error in tab activation:', error);
  }
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    if (currentTabId) {
      updateTimeForTab(currentTabId);
    }
    currentTabId = null;
    currentSession = { url: null, startTime: null };
  } else {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        currentTabId = tabs[0].id;
        startTime = Date.now();
        currentSession = {
          url: new URL(tabs[0].url).hostname,
          startTime: Date.now()
        };
      }
    });
  }
});
function updateTimeForTab(tabId) {
  if (!startTime) return;
  const endTime = Date.now();
  const timeSpent = endTime - startTime;
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    const url = new URL(tab.url).hostname;
    if (!tabTimes[url]) {
      tabTimes[url] = 0;
    }
    tabTimes[url] += timeSpent;
    chrome.storage.local.get(['timeHistory'], function(result) {
      const history = result.timeHistory || [];
      const today = new Date().toISOString().split('T')[0];
      let todayEntry = history.find(entry => entry.date === today);
      if (!todayEntry) {
        todayEntry = { date: today, timestamp: Date.now(), times: {} };
        history.push(todayEntry);
      }
      todayEntry.times[url] = (todayEntry.times[url] || 0) + timeSpent;
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const recentHistory = history.filter(entry => entry.timestamp >= thirtyDaysAgo);
      chrome.storage.local.set({ 
        tabTimes: tabTimes,
        timeHistory: recentHistory
      });
    });
  });
  startTime = endTime;
}
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (request.type === 'getStartTime') {
      const currentTime = currentSession.url ? (tabTimes[currentSession.url] || 0) : 0;
      sendResponse({ 
        startTime: currentSession.startTime,
        currentUrl: currentSession.url,
        totalTime: currentTime,
        isNewTab: !currentSession.url,
        currentSession: currentSession
      });
      return true;
    } else if (request.type === 'resetData') {
      tabTimes = {};
      currentSession = {
        url: null,
        startTime: null
      };
      chrome.storage.local.set({ 
        tabTimes: {},
        history: []
      }, function() {
        sendResponse();
      });
      return true;
    }
  }
);
function storeTimeWithDate() {
  const date = new Date().toISOString().split('T')[0];
  const dailyData = {
    date,
    times: tabTimes
  };
  chrome.storage.local.get(['history'], function(result) {
    const history = result.history || [];
    history.push(dailyData);
    chrome.storage.local.set({ history });
  });
}
function checkTimeLimit(url, time) {
  if (SITE_LIMITS[url] && time > SITE_LIMITS[url] * 60000) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Time Limit Reached',
      message: `You've spent over ${SITE_LIMITS[url]} minutes on ${url}`
    });
  }
}

function categorizeTime(url) {
  const category = SITE_CATEGORIES[url] || 'Other';
  if (!categoryTimes[category]) categoryTimes[category] = 0;
  categoryTimes[category] += timeSpent;
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && tabId === currentTabId) {
    if (currentSession.url) {
      updateTimeForTab(currentTabId);
    }
    try {
      const newUrl = new URL(tab.url);
      if (newUrl.protocol.startsWith('chrome')) {
        currentSession = { url: null, startTime: null };
      } else {
        currentSession = {
          url: newUrl.hostname,
          startTime: Date.now()
        };
      }
    } catch (e) {
      currentSession = {url: null, startTime: null };
    }
  }
});
function cleanupOldData() {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  chrome.storage.local.get(['timeHistory'], function(result) {
    const history = result.timeHistory || [];
    const cleanHistory = history.filter(entry => entry.timestamp >= thirtyDaysAgo);
    chrome.storage.local.set({ timeHistory: cleanHistory });
  });
} 
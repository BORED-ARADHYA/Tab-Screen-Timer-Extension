let currentSession = null;
let tickerInterval;
function formatTime(ms) {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor(ms / (1000 * 60 * 60));
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
function updateTicker(startTime, totalTime, isNewTab) {
  const ticker = document.getElementById('ticker');
  const currentUrl = document.getElementById('currentUrl');
  if (isNewTab) {
    ticker.textContent = '-- : -- : --';
    ticker.style.animation = 'none';
    currentUrl.textContent = 'New Tab';
    return;
  }
  if (startTime) {
    const currentTime = Date.now() - startTime;
    const total = totalTime + currentTime;
    ticker.textContent = formatTime(total);
    ticker.style.animation = 'pulse 1s infinite';
  } else {
    ticker.textContent = '00:00:00';
    ticker.style.animation = 'none';
  }
}
function getStartOfDay() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
function getStartOfWeek() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date.getTime();
}
function updateTimeList(period = 'all') {
  const timeList = document.getElementById('timeList');
  timeList.innerHTML = '<div class="loading">Loading...</div>';

  chrome.storage.local.get(['tabTimes', 'timeHistory'], function(result) {
    try {
      timeList.innerHTML = ''; 
      let timesToShow = {};
      const now = Date.now();

      if (period === 'all') {
        timesToShow = { ...(result.tabTimes || {}) };
        if (currentSession && currentSession.url && currentSession.startTime) {
          const currentTime = Date.now() - currentSession.startTime;
          timesToShow[currentSession.url] = (timesToShow[currentSession.url] || 0) + currentTime;
        }
      } else {
        const history = result.timeHistory || [];
        const startTime = period === 'daily' ? getStartOfDay() : getStartOfWeek();
        history.forEach(entry => {
          if (entry.timestamp >= startTime) {
            Object.entries(entry.times).forEach(([site, time]) => {
              timesToShow[site] = (timesToShow[site] || 0) + time;
            });
          }
        });
        if (currentSession && currentSession.startTime >= startTime) {
          const currentTime = Date.now() - currentSession.startTime;
          if (currentSession.url) {
            timesToShow[currentSession.url] = (timesToShow[currentSession.url] || 0) + currentTime;
          }
        }
      }

      const sortedSites = Object.entries(timesToShow).sort(([, a], [, b]) => b - a);
      if (sortedSites.length === 0) {
        const div = document.createElement('div');
        div.className = 'no-data';
        div.textContent = `No activity ${period === 'daily' ? 'today' : 'this week'} yet`;
        timeList.appendChild(div);
      } else {
        sortedSites.forEach(([site, time]) => {
          const div = document.createElement('div');
          div.className = 'site-time';
          div.innerHTML = `
            <a href="https://${site}" target="_blank" class="site-name">${site}</a>
            <span class="time">${formatTime(time)}</span>
          `;
          timeList.appendChild(div);
        });
      }
      const totalTime = Object.values(timesToShow).reduce((a, b) => a + b, 0);
      const title = document.getElementById('statsTitle');
      title.textContent = period === 'all' ? 'Total Time Spent' :
                          period === 'daily' ? `Today's Activity (${formatTime(totalTime)})` :
                          `This Week's Activity (${formatTime(totalTime)})`;
    } catch (error) {
      timeList.innerHTML = '<div class="error">Error loading data</div>';
      console.error('Error updating time list:', error);
    }
  });
}
function startPeriodicUpdates() {
  const activeTab = document.querySelector('.tab-btn.active');
  if (activeTab) {
    updateTimeList(activeTab.dataset.tab);
  }
}
function updateDisplay() {
  chrome.runtime.sendMessage({ type: 'getStartTime' }, function(response) {
    currentSession = response.currentSession;
    if (response.isNewTab) {
      updateTicker(null, 0, true);
    } else if (response.currentUrl) {
      document.getElementById('currentUrl').textContent = response.currentUrl;
      updateTicker(response.startTime, response.totalTime, false);
    }
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab) {
      updateTimeList(activeTab.dataset.tab);
    }
  });
}
document.addEventListener('DOMContentLoaded', function() {
  updateDisplay();
  setInterval(updateDisplay, 1000);
  updateTimeList('all');
});
window.addEventListener('unload', function() {
});
function addChartView() {
  const canvas = document.createElement('canvas');
  canvas.id = 'timeChart';
  new Chart(canvas, {
    type: 'pie',
    data: {
      labels: sites,
      datasets: [{
        data: times,
        backgroundColor: ['#4285f4', '#34a853', '#fbbc05', '#ea4335', '#673ab7']
      }]
    }
  });
}
document.getElementById('exportBtn').addEventListener('click', function() {
  chrome.storage.local.get(['tabTimes'], function(result) {
    const data = JSON.stringify(result.tabTimes, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tab-time-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  });
});
function calculateProductivityScore() {
  const productive = ['github.com', 'stackoverflow.com', 'docs.google.com'];
  const unproductive = ['facebook.com', 'instagram.com', 'twitter.com'];
  let productiveTime = 0;
  let unproductiveTime = 0;
  Object.entries(tabTimes).forEach(([site, time]) => {
    if (productive.some(p => site.includes(p))) productiveTime += time;
    if (unproductive.some(u => site.includes(u))) unproductiveTime += time;
  });
  return Math.round((productiveTime / (productiveTime + unproductiveTime)) * 100);
}
document.getElementById('resetBtn').addEventListener('click', function() {
  if (confirm('Are you sure you want to reset all time tracking data?')) {
    chrome.runtime.sendMessage({ type: 'resetData' }, function() {
      const timeList = document.getElementById('timeList');
      timeList.innerHTML = '';
      const ticker = document.getElementById('ticker');
      ticker.textContent = '00:00:00';
      const div = document.createElement('div');
      div.textContent = 'All data has been reset!';
      div.style.textAlign = 'center';
      div.style.color = '#4285f4';
      div.style.padding = '10px';
      timeList.appendChild(div);
    });
  }
});
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updateTimeList(btn.dataset.tab);
  });
}); 
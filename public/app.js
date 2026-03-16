const elements = {
    url: document.getElementById('url'),
    waitUntil: document.getElementById('waitUntil'),
    delay: document.getElementById('delay'),
    width: document.getElementById('width'),
    height: document.getElementById('height'),
    session: document.getElementById('session'),
    saveHtml: document.getElementById('saveHtml'),
    saveScreenshot: document.getElementById('saveScreenshot'),
    savePdf: document.getElementById('savePdf'),
    scroll: document.getElementById('scroll'),
    headless: document.getElementById('headless'),
    saveSession: document.getElementById('saveSession'),
    startBtn: document.getElementById('startBtn'),
    activeJob: document.getElementById('activeJob'),
    jobStatus: document.getElementById('jobStatus'),
    progressBar: document.getElementById('progressBar'),
    jobLogs: document.getElementById('jobLogs'),
    jobResult: document.getElementById('jobResult'),
    fileList: document.getElementById('fileList'),
    historyList: document.getElementById('historyList')
};

let currentJobId = null;
let pollInterval = null;

async function init() {
    await loadSessions();
    await loadHistory();
    
    elements.startBtn.addEventListener('click', startCapture);
}

async function loadSessions() {
    try {
        const res = await fetch('/api/sessions');
        const sessions = await res.json();
        sessions.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.name;
            opt.textContent = s.name;
            elements.session.appendChild(opt);
        });
    } catch (e) {
        console.error('Failed to load sessions');
    }
}

async function loadHistory() {
    try {
        const res = await fetch('/api/outputs');
        const folders = await res.json();
        
        if (folders.length === 0) return;
        
        elements.historyList.innerHTML = '';
        folders.forEach(folder => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.innerHTML = `
                <div class="history-item-info">
                    <h4>${folder}</h4>
                </div>
                <div class="history-item-actions">
                    <button class="btn-small" onclick="viewFolder('${folder}')">View</button>
                </div>
            `;
            elements.historyList.appendChild(item);
        });
    } catch (e) {
        console.error('Failed to load history');
    }
}

async function viewFolder(folder) {
    try {
        const res = await fetch(`/api/outputs/${folder}`);
        const data = await res.json();
        
        // Show in "Current Job" section for simplicity
        elements.activeJob.classList.remove('hidden');
        elements.jobStatus.textContent = 'Completed';
        elements.jobStatus.className = 'status-badge completed';
        elements.progressBar.style.width = '100%';
        elements.jobLogs.innerHTML = '<div>Viewing archived capture.</div>';
        
        showResult(data.folder, data.files, data.metadata);
        elements.activeJob.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
        alert('Failed to load folder details');
    }
}

async function startCapture() {
    const data = {
        url: elements.url.value,
        waitUntil: elements.waitUntil.value,
        delay: parseInt(elements.delay.value),
        width: parseInt(elements.width.value),
        height: parseInt(elements.height.value),
        session: elements.session.value,
        saveHtml: elements.saveHtml.checked,
        saveScreenshot: elements.saveScreenshot.checked,
        savePdf: elements.savePdf.checked,
        scroll: elements.scroll.checked,
        headless: elements.headless.checked,
        saveStorageState: elements.saveSession.checked
    };

    if (!data.url) return alert('Please enter a URL');

    elements.startBtn.disabled = true;
    elements.activeJob.classList.remove('hidden');
    elements.jobResult.classList.add('hidden');
    elements.jobLogs.innerHTML = '';
    elements.progressBar.style.width = '0%';
    elements.jobStatus.textContent = 'Pending';
    elements.jobStatus.className = 'status-badge pending';

    try {
        const res = await fetch('/api/capture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        
        if (result.error) throw new Error(result.error);
        
        currentJobId = result.jobId;
        startPolling();
    } catch (e) {
        alert('Error: ' + e.message);
        elements.startBtn.disabled = false;
    }
}

function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
        try {
            const res = await fetch(`/api/jobs/${currentJobId}`);
            const job = await res.json();
            
            updateUI(job);
            
            if (job.status === 'completed' || job.status === 'failed') {
                clearInterval(pollInterval);
                elements.startBtn.disabled = false;
                loadHistory();
            }
        } catch (e) {
            console.error('Polling error', e);
        }
    }, 1000);
}

function updateUI(job) {
    elements.jobStatus.textContent = job.status;
    elements.jobStatus.className = `status-badge ${job.status}`;
    
    // Simple progress simulation or use actual if backend provided
    if (job.status === 'completed') elements.progressBar.style.width = '100%';
    else if (job.status === 'failed') elements.progressBar.style.width = '100%';
    else elements.progressBar.style.width = '50%';

    elements.jobLogs.innerHTML = job.logs.map(l => `<div>[${l.timestamp.slice(11, 19)}] ${l.message}</div>`).join('');
    elements.jobLogs.scrollTop = elements.jobLogs.scrollHeight;

    if (job.status === 'completed' && job.result) {
        showResult(job.result.folderName, Object.values(job.result.metadata.files), job.result.metadata);
    }
}

function showResult(folder, files, metadata) {
    elements.jobResult.classList.remove('hidden');
    elements.fileList.innerHTML = '';
    
    const allFiles = [...Object.entries(metadata.files), ['metadata.json', 'metadata.json'], ['console.log', 'console.log'], ['network-summary.json', 'network-summary.json']];

    allFiles.forEach(([key, filename]) => {
        const li = document.createElement('li');
        li.innerHTML = `<a href="/outputs/${folder}/${filename}" target="_blank">${filename}</a>`;
        elements.fileList.appendChild(li);
    });
}

window.viewFolder = viewFolder;
init();

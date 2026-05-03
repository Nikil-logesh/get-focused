/**
 * Get Focused — Consent Page Logic
 */

document.getElementById('btn-accept').addEventListener('click', function () {
  chrome.storage.local.set({ dataConsentGiven: true }, function () {
    var msg = document.getElementById('status-msg');
    msg.textContent = 'Thank you. Data sharing enabled. You can close this tab.';
    msg.style.display = 'block';
    document.getElementById('btn-accept').disabled = true;
    document.getElementById('btn-decline').disabled = true;
    document.getElementById('btn-accept').style.opacity = '0.5';
    document.getElementById('btn-decline').style.opacity = '0.5';
  });
});

document.getElementById('btn-decline').addEventListener('click', function () {
  chrome.storage.local.set({ dataConsentGiven: false }, function () {
    var msg = document.getElementById('status-msg');
    msg.textContent = 'Preference saved. The extension will work normally. You can close this tab.';
    msg.style.display = 'block';
    document.getElementById('btn-accept').disabled = true;
    document.getElementById('btn-decline').disabled = true;
    document.getElementById('btn-accept').style.opacity = '0.5';
    document.getElementById('btn-decline').style.opacity = '0.5';
  });
});

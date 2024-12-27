importScripts("jszip.min.js");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "captureSource") {
    captureSourceContent(message.tabId);
  } else if (message.html && message.resources) {
    handleDownload(message).then(() => {
      chrome.runtime.sendMessage({ action: "hideLoadingText" });
      chrome.runtime.sendMessage({ action: "showDoneText" });
    });
  }
});

async function captureSourceContent(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);

    // Check if it's a chrome:// URL
    if (tab.url.startsWith("chrome://")) {
      throw new Error("Cannot capture chrome:// pages");
    }

    const response = await fetch(tab.url, { credentials: "include" });
    if (!response.ok) {
      throw new Error("Network response was not ok");
    }
    const html = await response.text();

    // Inject the content script
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content.js"],
    });

    // Send the HTML to the content script for processing
    chrome.tabs.sendMessage(tabId, {
      action: "processHTML",
      html: html,
      baseURL: tab.url,
    });
  } catch (error) {
    console.error("Failed to capture the page source:", error);
    if (error.message === "Cannot capture chrome:// pages") {
      showErrorPopup("chrome_error.html");
    } else {
      showErrorPopup("error.html");
    }
  }
}

// Add this new function to show error popups
function showErrorPopup(errorPage) {
  chrome.action.setPopup({ popup: errorPage });
  setTimeout(() => {
    chrome.action.setPopup({ popup: "popup.html" });
  }, 3000); // Reset to original popup after 3 seconds
}

// Modified function to decode HTML entities without using document
function decodeHtmlEntities(text) {
  const entities = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&#x2F;": "/",
    "&#x60;": "`",
    "&#x3D;": "=",
  };
  return text.replace(/&[#\w]+;/g, (entity) => entities[entity] || entity);
}

let isDownloadInProgress = false;

async function handleDownload(message) {
  if (isDownloadInProgress) {
    console.log("Download already in progress. Ignoring new request.");
    return;
  }

  isDownloadInProgress = true;
  chrome.runtime.sendMessage({ action: "resetProgress" });

  let { html, resources, fromServer } = message;
  console.log("Resources received:", resources);

  // Add comment at the top of the HTML
  html = `<!--  This landing page has been captured by Landing Page Ripper Chrome extension developed by thelanders.club. If you want to get this lander cleaned, visit thelanders.club -->\n${html}`;

  // Decode HTML entities
  html = decodeHtmlEntities(html);

  // Generate a unique folder name based on the current timestamp
  const folderName = `page_${Date.now()}`;

  const htmlFileName = fromServer ? "index.html" : "index.html";

  // Create a new ZIP archive
  const zip = new JSZip();

  // Add HTML file to the ZIP
  zip.file(htmlFileName, html);

  // Download and add resources to the ZIP
  const totalResources = resources.length;
  for (let i = 0; i < totalResources; i++) {
    const resource = resources[i];
    if (!resource.url) {
      console.warn(`Skipping invalid resource:`, resource);
      continue;
    }

    try {
      const response = await fetch(resource.url);
      const blob = await response.blob();
      zip.file(resource.filename, blob);
    } catch (error) {
      console.warn(`Failed to fetch resource: ${resource.url}`, error);
    }

    // Update progress
    const progress = Math.round(((i + 1) / totalResources) * 100);
    chrome.runtime.sendMessage({
      action: "updateProgress",
      progress: progress,
    });
  }

  // Generate the ZIP file
  const zipBlob = await zip.generateAsync({ type: "blob" });

  // Convert Blob to base64 data URL
  const reader = new FileReader();
  reader.onload = function () {
    const dataUrl = reader.result;

    // Create a download using chrome.downloads.download
    chrome.downloads.download(
      {
        url: dataUrl,
        filename: `thelanders.club/${folderName}.zip`, // Updated to download in thelanders.club directory
        saveAs: false, // This attempts to download without prompting
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error("Download failed:", chrome.runtime.lastError);
        } else {
          console.log("Download started with ID:", downloadId);
        }
        chrome.runtime.sendMessage({ action: "hideLoadingText" });
        chrome.runtime.sendMessage({ action: "showDoneText" });
        isDownloadInProgress = false; // Reset the flag here
      }
    );
  };
  reader.readAsDataURL(zipBlob);
}

// Remove the blobToBase64 function as it's no longer needed

function showAlert(tabId, message) {
  chrome.tabs.sendMessage(tabId, {
    action: "showAlert",
    message: message,
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  // Check if user is already authenticated
  const isAuthenticated = await chrome.storage.local.get("isAuthenticated");
  if (isAuthenticated.isAuthenticated) {
    showMainContent();
  } else {
    showEmailForm();
  }
});

function showEmailForm() {
  document.getElementById("email-form").style.display = "block";
  document.getElementById("main-content").style.display = "none";
}

function showMainContent() {
  document.getElementById("email-form").style.display = "none";
  document.getElementById("main-content").style.display = "block";
}

// Add email submission handler
document
  .getElementById("submit-email-btn")
  .addEventListener("click", async () => {
    const emailInput = document.getElementById("user-email");
    const email = emailInput.value.trim();

    if (!email || !email.includes("@")) {
      alert("Please enter a valid email address");
      return;
    }

    try {
      const response = await fetch(
        "https://track.landingpageripper.com/api/email",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email }),
        }
      );

      if (response.ok) {
        // Save authentication status to chrome storage
        await chrome.storage.local.set({ isAuthenticated: true });
        showMainContent();
      } else {
        const data = await response.json();
        alert(data.error || "Failed to submit email");
      }
    } catch (error) {
      alert("Error submitting email. Please try again.");
      console.error("Error:", error);
    }
  });

document
  .getElementById("capture-tab-btn")
  .addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    resetProgress();
    showLoadingText();
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: downloadPageContent,
    });
  });

document
  .getElementById("capture-tab-source-btn")
  .addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    resetProgress();
    showLoadingText();
    chrome.runtime.sendMessage({ action: "captureSource", tabId: tab.id });
  });

function downloadPageContent() {
  // Create a deep clone of the document
  const docClone = document.cloneNode(true);

  const resources = [];
  const promises = [];

  // Helper function to process image URLs
  function processImageUrl(url, index, type = "image") {
    const extension = url.split(".").pop().split("?")[0];
    const imageName = `assets/${type}${index}.${extension}`;
    resources.push({ url: url, filename: imageName });
    return imageName;
  }

  // Capture Images
  const images = Array.from(docClone.querySelectorAll("img"));
  images.forEach((img, index) => {
    if (img.src) {
      img.src = processImageUrl(img.src, index);
    }
    if (img.srcset) {
      const srcset = img.srcset
        .split(",")
        .map((src) => {
          const [url, size] = src.trim().split(" ");
          return `${processImageUrl(url, index)} ${size}`;
        })
        .join(", ");
      img.srcset = srcset;
    }
    // Process data-src attributes
    [
      "data-src-desktop-1x",
      "data-src-desktop-2x",
      "data-src-mobile-1x",
      "data-src-mobile-2x",
      "data-src-mobile-3x",
    ].forEach((attr) => {
      if (img.hasAttribute(attr)) {
        img.setAttribute(attr, processImageUrl(img.getAttribute(attr), index));
      }
    });
  });

  // Capture CSS
  const stylesheets = Array.from(
    docClone.querySelectorAll("link[rel='stylesheet']")
  );
  stylesheets.forEach((link, index) => {
    const cssUrl = link.href;
    const cssName = `assets/style${index}.css`;
    resources.push({ url: cssUrl, filename: cssName });
    link.href = cssName;

    // Fetch and process CSS content
    const promise = fetch(cssUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch CSS: ${response.statusText}`);
        }
        return response.text();
      })
      .then((cssContent) => {
        const backgroundImages =
          cssContent.match(/url\(['"]?(.+?)['"]?\)/g) || [];
        console.log("Popup.js - Background images:", backgroundImages);
        backgroundImages.forEach((match, bgIndex) => {
          const imageUrl = match.replace(/url\(['"]?(.+?)['"]?\)/, "$1");
          const fullImageUrl = new URL(imageUrl, cssUrl).href;
          console.log("Popup.js - Full image URL:", fullImageUrl);
          const originalFileName = fullImageUrl.split("/").pop().split("?")[0];
          const imageName = originalFileName; // Remove 'assets/' prefix
          resources.push({
            url: fullImageUrl,
            filename: `assets/${imageName}`,
          });
          console.log("Popup.js - Added resource:", {
            url: fullImageUrl,
            filename: `assets/${imageName}`,
          });
          cssContent = cssContent.replace(match, `url('${imageName}')`);
        });
        // Update CSS content with new image paths
        resources.push({
          url: `data:text/css;base64,${btoa(cssContent)}`,
          filename: cssName,
        });
      })
      .catch((error) => {
        console.error("Popup.js - Failed to fetch CSS:", error);
      });
    promises.push(promise);
  });

  // Capture JS
  const scripts = Array.from(docClone.querySelectorAll("script[src]"));
  scripts.forEach((script, index) => {
    const jsUrl = script.src;
    const jsName = `assets/script${index}.js`;
    resources.push({ url: jsUrl, filename: jsName });
    script.src = jsName;
  });

  // Capture Videos
  const videos = Array.from(docClone.querySelectorAll("video"));
  videos.forEach((video, index) => {
    // Capture video source
    const sources = Array.from(video.querySelectorAll("source"));
    sources.forEach((source, sourceIndex) => {
      const videoUrl = source.src;
      const extension = videoUrl.split(".").pop().split("?")[0];
      const videoName = `assets/video${index}_${sourceIndex}.${extension}`;
      resources.push({ url: videoUrl, filename: videoName });
      source.src = videoName;
    });

    // If video has 'src' attribute
    if (video.src) {
      const videoUrl = video.src;
      const extension = videoUrl.split(".").pop().split("?")[0];
      const videoName = `assets/video${index}.${extension}`;
      resources.push({ url: videoUrl, filename: videoName });
      video.src = videoName;
    }

    // Capture poster image if present
    if (video.poster) {
      const posterUrl = video.poster;
      const extension = posterUrl.split(".").pop().split("?")[0];
      const posterName = `assets/video${index}_poster.${extension}`;
      resources.push({ url: posterUrl, filename: posterName });
      video.poster = posterName;
    }
  });

  // Serialize the HTML content with updated resource paths
  const htmlContent = new XMLSerializer().serializeToString(docClone);

  // Wait for all promises to resolve before sending the message
  Promise.all(promises)
    .then(() => {
      console.log("Popup.js - All resources sumon:", resources);

      // Send the HTML content and resource map back to the background script
      chrome.runtime.sendMessage(
        {
          html: htmlContent,
          resources: resources,
          fromServer: false,
        },
        () => {
          hideLoadingText();
          showDoneText();
        }
      );
    })
    .catch((error) => {
      console.error("Popup.js - Error in processing promises:", error);
      hideLoadingText();
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "downloadZip") {
    const blob = base64ToBlob(message.zipBlob, "application/zip");
    const url = URL.createObjectURL(blob);

    chrome.downloads.download(
      {
        url: url,
        filename: message.filename,
        saveAs: true,
      },
      () => {
        URL.revokeObjectURL(url);
        hideLoadingText();
        showDoneText();
      }
    );
  }
});

// Helper function to show loading text
function showLoadingText() {
  resetProgress();
  document.getElementById("loading-text").style.display = "block";
  document.getElementById("progress-container").style.display = "block";
  document.getElementById("done-text").style.display = "none";
}

// Helper function to hide loading text
function hideLoadingText() {
  document.getElementById("loading-text").style.display = "none";
}

// Helper function to show done text
function showDoneText() {
  const doneText = document.getElementById("done-text");
  doneText.style.display = "block";
  setTimeout(() => {
    doneText.style.display = "none";
    document.getElementById("progress-container").style.display = "none";
  }, 3000);
}

// Helper function to convert Base64 to Blob
function base64ToBlob(base64, type = "application/octet-stream") {
  const binStr = atob(base64);
  const len = binStr.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = binStr.charCodeAt(i);
  }
  return new Blob([arr], { type: type });
}

// Add this function to reset the progress bar
function resetProgress() {
  const progressContainer = document.getElementById("progress-container");
  const progressBar = document.getElementById("progress-bar");
  const progressText = document.getElementById("progress-text");

  progressContainer.style.display = "block";
  progressBar.style.width = "0%";
  progressText.textContent = "0%";
}

document.addEventListener("DOMContentLoaded", function () {
  const captureTabBtn = document.getElementById("capture-tab-btn");
  const captureTabSourceBtn = document.getElementById("capture-tab-source-btn");

  captureTabBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    resetProgress();
    showLoadingText();
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: downloadPageContent,
    });
  });

  captureTabSourceBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    resetProgress();
    showLoadingText();
    chrome.runtime.sendMessage({ action: "captureSource", tabId: tab.id });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "hideLoadingText") {
      hideLoadingText();
    } else if (message.action === "showDoneText") {
      showDoneText();
    } else if (message.action === "updateProgress") {
      updateProgress(message.progress);
    } else if (message.action === "resetProgress") {
      resetProgress();
    }
  });

  function showLoadingText() {
    resetProgress();
    document.getElementById("loading-text").style.display = "block";
    document.getElementById("progress-container").style.display = "block";
    document.getElementById("done-text").style.display = "none";
  }

  function hideLoadingText() {
    document.getElementById("loading-text").style.display = "none";
  }

  function showDoneText() {
    const doneText = document.getElementById("done-text");
    doneText.style.display = "block";
    setTimeout(() => {
      doneText.style.display = "none";
      document.getElementById("progress-container").style.display = "none";
    }, 3000);
  }

  function updateProgress(progress) {
    const progressBar = document.getElementById("progress-bar");
    const progressText = document.getElementById("progress-text");
    const progressContainer = document.getElementById("progress-container");

    progressContainer.style.display = "block";
    progressBar.style.width = `${progress}%`;
    progressText.textContent = `${progress}%`;
  }

  function resetProgress() {
    const progressContainer = document.getElementById("progress-container");
    const progressBar = document.getElementById("progress-bar");
    const progressText = document.getElementById("progress-text");

    progressContainer.style.display = "block";
    progressBar.style.width = "0%";
    progressText.textContent = "0%";
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "showAlert") {
    alert(message.message);
  } else if (message.action === "processHTML") {
    processHTML(message.html, message.baseURL);
  }
});

function processHTML(html, baseURL) {
  const doc = new DOMParser().parseFromString(html, "text/html");

  const resources = [];
  const promises = [];

  // Capture CSS
  const stylesheets = Array.from(
    doc.querySelectorAll("link[rel='stylesheet']")
  );
  stylesheets.forEach((link, index) => {
    const cssUrl = new URL(link.href, baseURL).href;
    const cssName = `assets/style${index}.css`;
    resources.push({ url: cssUrl, filename: cssName });
    link.href = cssName;

    // Fetch and process CSS content
    const promise = fetch(cssUrl, { mode: "no-cors" })
      .then((response) => response.text())
      .then((cssContent) => {
        const backgroundImages =
          cssContent.match(/url\(['"]?(.+?)['"]?\)/g) || [];
        console.log("Content.js - Background images:", backgroundImages);
        backgroundImages.forEach((match, bgIndex) => {
          const imageUrl = match.replace(/url\(['"]?(.+?)['"]?\)/, "$1");
          const fullImageUrl = new URL(imageUrl, cssUrl).href;
          console.log("Content.js - Full image URL:", fullImageUrl);
          const originalFileName = fullImageUrl.split("/").pop().split("?")[0];
          const imageName = originalFileName; // Remove 'assets/' prefix
          resources.push({
            url: fullImageUrl,
            filename: `assets/${imageName}`,
          });
          console.log("Content.js - Added resource:", {
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
        console.error("Failed to fetch CSS:", error);
      });
    promises.push(promise);
  });

  // Capture Images
  const images = Array.from(doc.querySelectorAll("img"));
  images.forEach((img, index) => {
    const imageUrl = new URL(img.src, baseURL).href;
    const extension = imageUrl.split(".").pop().split("?")[0];
    const imageName = `assets/image${index}.${extension}`;
    resources.push({ url: imageUrl, filename: imageName });
    img.src = imageName;
  });

  // Capture JS
  const scripts = Array.from(doc.querySelectorAll("script[src]"));
  scripts.forEach((script, index) => {
    const jsUrl = new URL(script.src, baseURL).href;
    const jsName = `assets/script${index}.js`;
    resources.push({ url: jsUrl, filename: jsName });
    script.src = jsName;
  });

  // Capture Videos
  const videos = Array.from(doc.querySelectorAll("video"));
  videos.forEach((video, index) => {
    // Capture video source
    const sources = Array.from(video.querySelectorAll("source"));
    sources.forEach((source, sourceIndex) => {
      const videoUrl = new URL(source.src, baseURL).href;
      const extension = videoUrl.split(".").pop().split("?")[0];
      const videoName = `assets/video${index}_${sourceIndex}.${extension}`;
      resources.push({ url: videoUrl, filename: videoName });
      source.src = videoName;
    });

    // If video has 'src' attribute
    if (video.src) {
      const videoUrl = new URL(video.src, baseURL).href;
      const extension = videoUrl.split(".").pop().split("?")[0];
      const videoName = `assets/video${index}.${extension}`;
      resources.push({ url: videoUrl, filename: videoName });
      video.src = videoName;
    }

    // Capture poster image if present
    if (video.poster) {
      const posterUrl = new URL(video.poster, baseURL).href;
      const extension = posterUrl.split(".").pop().split("?")[0];
      const posterName = `assets/video${index}_poster.${extension}`;
      resources.push({ url: posterUrl, filename: posterName });
      video.poster = posterName;
    }
  });

  // Serialize updated HTML
  const updatedHtml = new XMLSerializer().serializeToString(doc);

  // Wait for all promises to resolve before sending the message
  Promise.all(promises).then(() => {
    console.log("Content.js - All resources:", resources);

    // Send the HTML content and resources map to be downloaded
    chrome.runtime.sendMessage({
      html: updatedHtml,
      resources: resources,
      fromServer: true,
    });
  });
}

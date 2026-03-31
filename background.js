chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'https://www.perplexity.ai' });
});

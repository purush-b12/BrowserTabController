
function closeDuplicateTabs(){
    chrome.tabs.query({}, (tabs) => {
        var urlSet = {};
        for (let i = 0; i < tabs.length; i++) {
            if (tabs[i].url) {
                var openURL = tabs[i].url.toString();
                if(urlSet[openURL] && urlSet[openURL] == true){
                    chrome.tabs.remove(tabs[i].id, function() {});
                }else{
                    urlSet[openURL] = true;
                }
                
            }
        }
    
        urlSet = {};
    });
}


chrome.alarms.create('TabAssistantPeriodic', { delayInMinutes: 1.0, periodInMinutes: 1.0 * 60.0 * 24 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if(alarm.name == 'TabAssistantPeriodic'){
        closeDuplicateTabs();
    }
});
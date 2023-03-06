

function closeDuplicateTabs(){

    return new Promise(async (resolve) =>{

        // remove duplicate tabs for all windows
        chrome.windows.getAll((windows) => {
            windows.forEach(window => {
                chrome.tabs.query({ windowId: window.id }, (tabs) => {
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
        
            });

            resolve();
        });
        
        
    });
    
}

export { closeDuplicateTabs };

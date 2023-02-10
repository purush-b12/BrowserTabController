const GLOBAL_BOOKMARK_TREE = 'GLOBAL_BOOKMARK_TREE';
const OPEN_WINDOW_TABS_LIST_MAP = 'OPEN_WINDOW_TABS_LIST_MAP';
var bookmar_tree = null;
var windows_tab_map = null;

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

chrome.alarms.get('DuplicatTabCheckPeriodic', (alarm) => {

    if(!alarm){
        //every 24 hours checks for duplicate tabs and closes it
        chrome.alarms.create('DuplicatTabCheckPeriodic', { delayInMinutes: 1.0, periodInMinutes: 1.0 * 60.0 * 24 });
    }
})

chrome.alarms.get('LongStayingTabCheckPeriodic', (alarm) => {

    if(!alarm){
        //Every 5 days it checks for long staying tabs, moves it to bookmarks with easy accessible option and closes the tab
        chrome.alarms.create('LongStayingTabCheckPeriodic', { delayInMinutes: 1.0, periodInMinutes: 1.0 * 60.0 * 24 * 5 });
    }
})

/*chrome.alarms.get('UpdateCacheBookmarTreePeriodic', (alarm) => {

    if(!alarm){
        //Every 12 hours it checks bookmar folder and clears
        // try to use onTabCreates + updated
        chrome.alarms.create('UpdateCacheBookmarTreePeriodic', { delayInMinutes: 1.0, periodInMinutes: 1.0 * 60.0 * 12 });
    }
})*/


chrome.alarms.onAlarm.addListener(async (alarm) => {
    var initPromiseList = [];

    if(alarm.name == 'DuplicatTabCheckPeriodic'){
        closeDuplicateTabs();
    }else if(alarm.name == 'LongStayingTabCheckPeriodic'){
        initPromiseList.push(getFromLocalStorage(GLOBAL_BOOKMARK_TREE));
        initPromiseList.push(getFromLocalStorage(OPEN_WINDOW_TABS_LIST_MAP));
        await Promise.all(initPromiseList);

        checkAndUpdateBookmarsFolder();

    }else if(alarm.name == 'UpdateCacheBookmarTreePeriodic'){

    }
});

//check if it is first time extension opens, if not compare current open list of tabs 
//and with lab list & time - update bookmark folder
async function checkAndUpdateBookmarsFolder(){

    
    if(!windows_tab_map){
        //create list of all tabs and windows, update local storage first time
        chrome.windows.getAll((windows) => {
            windows.forEach(window => {
                var tab_time_map = {};
                window.tabs.forEach(tab => {
                    tab_time_map[tab.id] = (new Date()).getDate();
                    
                });

                windows_tab_map[window.id] = tab_time_map;
            });
        })
        setToLocalStorage(OPEN_WINDOW_TABS_LIST_MAP, windows_tab_map);
       
    }else {
        // update window_tab map and filter out the tab list to move to bookmark folder
        var addToBookMarkList = {};
        chrome.windows.getAll((windows) => {
            windows.forEach(window => {
                
                if(windows_tab_map.includes(window.id)){
                    var wtm = windows_tab_map[window.id];
                    var bmMoveTablist = [];
                    window.tabs.forEach(tab => {
                        if(wtm.includes(tab.id)){
                            if(wtm[tab.id] <= ((new Date()).getDate() - 5)){
                                bmMoveTablist.push(tab);
                                delete wtm[tab.id];
                            }
                        }else{
                            wtm[tab.id] = (new Date()).getDate();
                        }
                    });
                    addToBookMarkList[window.id] = bmMoveTablist;
                    windows_tab_map[window.id] = wtm;

                }else{
                    var tab_time_map = {};
                    window.tabs.forEach(tab => {
                        tab_time_map[tab.id] = (new Date()).getDate();
                        
                    });

                    windows_tab_map[window.id] = tab_time_map;
                }

            });
        })
        setToLocalStorage(OPEN_WINDOW_TABS_LIST_MAP, windows_tab_map);

        //move tabs to bookmark and close tabs, add to local bookmark folder map
        if(Object.keys(bookmar_tree.bookmarkChildrens).length > 0){
            var childerWindowIds = [];
            var promiseList = [];
            for(var key in bookmar_tree.bookmarkChildrens){
                childerWindowIds.push(bookmar_tree.bookmarkChildrens[key].windowId);
            }

            for(var key in addToBookMarkList){
                if(key in childerWindowIds){
                    //todo

                }else{
                    var childernfolderName = 'Window' + (Object.keys(bookmar_tree.bookmarkChildrens).length + 1).toString();
                    bookmar_tree.bookmarkChildrens[childernfolderName] = {
                        windowId: key,
                        urlList: []
                    }
                    addToBookMarkList[key].forEach(tab => {
                        bookmar_tree.bookmarkChildrens[childernfolderName].urlList.push(tab.url);
                        chrome.tabs.remove(tab.id);
                    })
                    promiseList.push(createBookmarkBarFolder(childernfolderName, bookmar_tree.bookmarkFolderId, bookmar_tree.bookmarkChildrens[childernfolderName].urlList));
                }
            }

            await Promise.all(promiseList);

        }else{
            var promiseList = [];
            
            for(var key in addToBookMarkList){
                var childernfolderName = 'Window' + (Object.keys(bookmar_tree.bookmarkChildrens).length + 1).toString();
                bookmar_tree.bookmarkChildrens[childernfolderName] = {
                    windowId: key,
                    urlList: []
                }
                addToBookMarkList[key].forEach(tab => {
                    bookmar_tree.bookmarkChildrens[childernfolderName].urlList.push(tab.url);
                    chrome.tabs.remove(tab.id);
                })
                promiseList.push(createBookmarkBarFolder(childernfolderName, bookmar_tree.bookmarkFolderId, bookmar_tree.bookmarkChildrens[childernfolderName].urlList));
            }

            await Promise.all(promiseList);
            
        }

        setToLocalStorage(GLOBAL_BOOKMARK_TREE, bookmar_tree);
        
    }
}

async function createChildrenBookmarkFolder(folderName, parentId, urlList){
    return new Promise(async (resolve) => {
        chrome.bookmarks.create(
            {'parentId': parentId.toString(), 'title': folderName },
            async function(newFolder) {
                bookmar_tree.bookmarkChildrens[folderName]['childrenId'] = newFolder.id;
                var promiseList = [];
                urlList.forEach(url => {
                    promiseList.push(createChildrenBookmarks(url, newFolder.id));
                });
                await Promise.all(promiseList);
                setToLocalStorage(GLOBAL_BOOKMARK_TREE, bookmar_tree);
                resolve();
            },
        );
    });
    
}

async function createChildrenBookmarks(url, parentId){
    return new Promise(async (resolve) =>{
        chrome.bookmarks.create(
            {'parentId': parentId, 'url': url, 'title': url},
            function(n) {
                //console.log("success");
                resolve();
            },
        );
    });
}

//create bookmarks for all long staying tabs and close
function createBookmarkBarFolder(){

    chrome.bookmarks.create(
        {'parentId': '1', 'title': 'TabAssitant', 'index': 0},
        function(newFolder) {
          console.log("added folder: " + newFolder.title);    
            bookmar_tree = {
                bookmarkFolderId: newFolder.id,
                bookmarkChildrens: {}
            }

            setToLocalStorage(GLOBAL_BOOKMARK_TREE, bookmar_tree);
        },
    );

}

//checking if created bookmark folder still exists or create new
function checkForBookmarkFolderAvailable(){
    var bmFolderId = bookmar_tree.bookmarkFolderId;
    chrome.bookmarks.get(bmFolderId, (results) => {
        if(results.length == 0){
            createBookmarkBarFolder();
        }

    })

}

//get from local storage
async function getFromLocalStorage(storageKey){
    return new Promise(async (resolve) =>{
        chrome.storage.local.get([storageKey]).then((result) => {
            if(storageKey == GLOBAL_BOOKMARK_TREE){
                bookmar_tree = result;
                if(!bookmar_tree){
                    createBookmarkBarFolder();
                }else{
                    checkForBookmarkFolderAvailable();
                }

                resolve();
               
            }else if(storageKey == OPEN_WINDOW_TABS_LIST_MAP){
                windows_tab_map = result;
                resolve();
            }
        })
    });
    
}

//set to local storage
function setToLocalStorage(storageKey, value){
    chrome.storage.local.set({storageKey: value }).then(() => {
        console.log("Setting value to storage success");
    });
}



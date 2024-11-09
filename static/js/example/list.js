// 此文件要合并到assets文件里，目前在frjeco73h96nthv7.js
var config = {};
var layer = layui.layer;
var isEnabledVoice = false;
var isEnabledChatBuySub = false;
var isBuyCrossChat = false;
var homeUrl = "/";
var FAQ = "\u003cp style=\"text-align: center;\"\u003e\u003cspan style=\"color: rgb(225, 60, 57); background-color: rgb(252, 251, 207);\"\u003e\u003cstrong\u003e管理员暂未配置常见问题\u003c/strong\u003e\u003c/span\u003e\u003c/p\u003e";

const closeChatDialog = (menu) => {
    if (!menu) {
        return;
    }
    if (!isMobile()) {
        $("[data-headlessui-state] nav").parent().addClass("layui-hide");
        $("#headlessui-portal-root").addClass("layui-hide");
    }
}

const showFAQDialog = (menu) => {
    closeChatDialog(menu);
    showIframeDialog('常见问题', FAQ, 600, 1000, FAQ.startsWith("http") ? 2 : 1);
}
const showGoodsDialog = (menu) => {
    if (homeUrl.indexOf("pastel") > -1) {
        closeChatDialog(menu);
        showIframeDialog('站内购买', homeUrl + "#/subscribe", 710, 1125, 2);
    } else {
        layer.msg("当前站点不支持站内购买");
    }
}


//获取菜单项Html
const getMenuItemHtml = (text, iconName, onClick) => {
    return `<a style="flex:1;" class="flex gap-2 rounded p-2.5 text-sm cursor-pointer focus:ring-0 radix-disabled:pointer-events-none radix-disabled:opacity-50 group hover:bg-token-sidebar-surface-secondary" onclick="${onClick};">
                <i class="layui-icon ${iconName} layui-font-20"></i>
                ${text}
            </a>`;
}

const getRegAndLoginButtonHtml = (className, text, onClick) => {
    return `<button class="btn relative  ${className}" as="button" onclick="${onClick};">
                <div class="flex w-full gap-2 items-center justify-center">${text}</div>
            </button>`;
}

const initRegAndLoginButton = () => {

    //移除模型超限制的提示
    const rateElement = document.querySelector('div.flex.w-full.items-start.gap-4.rounded-2xl.border.border-token-border-light');
    if (rateElement) {
        rateElement.style.display = 'none';
        rateElement.remove();
    }

    var $div = $(".draggable.relative.h-full.w-full.flex-1.items-start nav>div:nth-child(3)");

    if ($div.length === 0) {
        return;
    }

    var allHaveInit = true;
    $div.each(function () {
        if (!$(this).hasClass("init")) {
            allHaveInit = false;
            return false; // 跳出 .each() 循环
        }
    });

    if (allHaveInit) {
        return;
    }
    $div.addClass("init")
    const html = `<div class="flex flex-col space-y-2">
                        <div style="display: flex;">
                            ${getMenuItemHtml("回到首页", "layui-icon-radio", "goHome(this)")}
                            ${getMenuItemHtml("一键换车", "layui-icon-util", "getIdleCar(this)")}
                        </div>
                        <div style="display: flex;">
                            ${getMenuItemHtml("常见问题", "layui-icon-question", "showFAQDialog(this)")}
                            ${getMenuItemHtml("退出登陆", "layui-icon-prev-circle", "logout(this)")}
                        </div>
                        <div class="flex flex-col space-y-2  juice:gap-2 juice:space-y-0">
                            ${isEnabledChatBuySub ? getRegAndLoginButtonHtml("btn-primary layui-btn-primary", "站内购买", "showGoodsDialog(this)") : ""}
                            ${isEnabledVoice ? getRegAndLoginButtonHtml("btn-secondary", "实时语音", "setVoice(this)") : ""}
                            ${isBuyCrossChat ? getRegAndLoginButtonHtml("btn-secondary", "换车继续聊", "setCrossChat(this)") : ""}
                        </div>
                   </div>`;
    $div.html(html);
}

const getUserSettingHtml = (icon, title, desc) => {
    return `<div>
                <i class="layui-icon ${icon} layui-font-28"></i>
            </div>
            <div style="flex: 1;display: flex;flex-direction: column;align-items: flex-start;">
                <div>${title}</div>        
                <div>${desc}</div>
            </div>`;
}

const goHome = () => {
    window.location.href = homeUrl;
}
const logout = () => {
    window.location.href = "/frontend-api/logout";
    $.get('/frontend-api/logout');
    goHome();
}

//移动端左上角菜单点击
$(document).on("click", ".draggable.sticky button.inline-flex", function (event) {
    event.stopPropagation();
    initRegAndLoginButton();
});
//增加resize事件
// $(window).on("resize", function () {
//     console.log("resize");
//     initRegAndLoginButton();
// });

//iframe弹窗
$(document).on("click", "[data-link]", function (event) {
    event.stopPropagation();
    const url = $(this).data("link");
    goToPage(url);
});

$(function () {
    getConfig();
    const pathname = window.location.pathname;
    if (!(pathname == "" || pathname == "/" || pathname.startsWith("/c/") || pathname == "/gpts" || pathname.startsWith("/g/"))) {
        return;
    }
    setInterval(() => {
        // console.log("initRegAndLoginButton");
        initRegAndLoginButton();
    }, 100);
    setTimeout(() => {
        document.head.appendChild(document.createElement('style')).innerHTML = 'div.h-full[class|=react-scroll-to-bottom--css]>div[class|=react-scroll-to-bottom--css]{overflow-y:auto;height:100%;}';
    }, 3000);
});

function getConfig() {
    const url = `/frontend-api/getConfig`;
    fetch(url)
        .then(response => response.json())
        .then(({ code, data }) => {
            if (code === 1) {
                isEnabledVoice = data.isEnabledVoice;
                homeUrl = data.theme;
                isEnabledChatBuySub = data.isEnabledChatBuySub && homeUrl.indexOf("pastel") > -1;
                isBuyCrossChat = data.isBuyCrossChat;
                FAQ = data.FAQ;
                // document.cookie = `_account=${data.teamId}; path=/`;
            }
            else {
                layer.msg(data);
            }
        })
        .catch(error => {
            // 处理错误
        });
}

function setVoice() {

    const loadIndex = setLoading("正在进入语音房间...");
    $.ajax({
        url: "/frontend-api/getVoice",
        method: "GET",
        timeout: 0,
    }).done(function (response) {
        console.log(response);
        layer.close(loadIndex);
        if (response.code === 1) {
            window.location.href = `/voice?e=${response.data.e2ee_key}&token=${response.data.token}&s=${response.data.voiceServerUrl}`
        }
        else {
            layer.msg(response.msg);
        }
    });
}

const showIframeDialog = (title, url, height, width, type = 1) => {
    const isMobileVal = isMobile();
    width = isMobileVal ? $(window).width() : width || Math.min($(window).width(), 1024);
    height = isMobileVal ? $(window).height() : height || Math.min($(window).height(), 800);
    layer.open({
        type: type,//1 html 2 url
        title: [title, "font-size: 18px;"],
        shadeClose: true,
        shade: 0.2,
        maxmin: true,
        scrollbar: false,
        offset: "auto",
        area: [`${width}px`, `${height}px`],
        content: url
    });
}

const isMobile = () => {
    const userAgent = navigator.userAgent.toLowerCase();
    return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(userAgent);
}



const goToPage = (url) => {
    const win = window == window.top ? window : window.top;
    win.location.href = url;
}

function getIdleCar(homeUrl) {
    const loadIndex = setLoading("正在获取最空闲的车...");
    const url = `/frontend-api/getIdleCar`;
    fetch(url)
        .then(response => response.json())
        .then(({ code, msg }) => {
            console.log(code, msg);
            if (code === 1) {
                window.location.href = "/";

            } else if (code === -1) {
                window.location.href = homeUrl;
            }
            else {
                alert(msg);
            }
            layer.close(loadIndex)

        })
        .catch(error => {
            layer.close(loadIndex)
            // 处理错误
        });
}

function setCrossChat() {
    convId = window.location.pathname.split("/c/")[1];
    if (!convId) {
        layer.msg("当前未进行任何会话");
        return;
    }
    const url = `/frontend-api/setCrossChat?convId=${convId}`;
    fetch(url)
        .then(response => response.json())
        .then(({ code, msg }) => {
            if (code === 1) {
                getIdleCar("/");
            } else {
                layer.msg(msg);
            }
        }
        )
}

function checkCarStatus() {
    const url = `/backend-api/models?history_and_training_disabled=false`;
    $.get(url).catch(() => {
        // 处理错误
        layer.msg("当前车队已翻车，正在为您重新分配车队...");
        getIdleCar("/");
    });
}


const setLoading = (msg) => {
    const loading = layer.msg(msg, {
        icon: 16,
        shade: 0.01,
        // time: 0,
    });
    return loading;
}
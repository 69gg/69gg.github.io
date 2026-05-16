---
title: Arduino->不要啦！
date: 2025-07-16 10:06:00
---

# 物流毕，快递一
等待两天后，快递终于到齐了。实际的操作完全比我想象的简单需要，在网上找几个引脚图，然后一个个接上去就行了。然后再找几个示例，拼接一下代码：
```cpp=
// ------------------- 1. 引入库 -------------------
#include <SPI.h>
#include <MFRC522.h>
#include <SoftwareSerial.h>
#include <DFRobotDFPlayerMini.h>

// ------------------- 2. 定义引脚和常量 -------------------
#define RST_PIN 9
#define SS_PIN  10

// ------------------- 3. 创建对象实例 -------------------
MFRC522 mfrc522(SS_PIN, RST_PIN);
SoftwareSerial mySoftwareSerial(2, 3); // RX, TX
DFRobotDFPlayerMini myDFPlayer;

// ------------------- 4. 定义全局变量 -------------------
String lastCardUID = ""; // 用于存储上一个触发播放的卡片UID，防重复的关键
bool dfPlayerInitialized = false; 

// ------------------- 5. setup() 初始化函数 (保持不变) -------------------
void setup() {
  Serial.begin(9600);
  while (!Serial);

  // --- 步骤一: 初始化并检查 MFRC522 ---
  SPI.begin();
  mfrc522.PCD_Init();
  byte version = mfrc522.PCD_ReadRegister(mfrc522.VersionReg);
  if (version == 0x00 || version == 0xFF) {
    Serial.println(F("错误: MFRC522 通信失败! 请检查接线。程序已停止。"));
    while (1);
  }
  Serial.println(F("MFRC522 模块通信正常!"));

  // --- 步骤二: 初始化并检查 DFPlayer ---
  mySoftwareSerial.begin(9600);
  Serial.println(F("正在初始化 DFPlayer Mini 模块..."));
  if (myDFPlayer.begin(mySoftwareSerial)) {
    dfPlayerInitialized = true;
    Serial.println(F("DFPlayer 初始化成功!"));
    myDFPlayer.volume(20);
    myDFPlayer.EQ(DFPLAYER_EQ_NORMAL);
  } else {
    dfPlayerInitialized = false;
    Serial.println(F("DFPlayer 初始化失败! 请检查接线和SD卡。"));
  }
  
  Serial.println(F("\n系统准备就绪，请刷卡..."));
}

// ------------------- 6. loop() 主循环函数 (已修复) -------------------
void loop() {
  // --- 步骤一: 检测是否有新的NFC卡片靠近 ---
  // 如果没有检测到新卡，就将 lastCardUID 清空，这是允许卡片移除后再次触发的关键
  if (!mfrc522.PICC_IsNewCardPresent()) {
    lastCardUID = "";
    return;
  }

  // --- 步骤二: 尝试读取卡片序列号 ---
  // 如果成功检测到但读取失败（比如卡片移动太快），也直接返回
  if (!mfrc522.PICC_ReadCardSerial()) {
    return;
  }

  // --- 步骤三: 格式化读取到的 UID ---
  String currentCardUID = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    if (mfrc522.uid.uidByte[i] < 0x10) {
      currentCardUID += "0";
    }
    currentCardUID += String(mfrc522.uid.uidByte[i], HEX);
    if (i < mfrc522.uid.size - 1) {
      currentCardUID += " ";
    }
  }
  currentCardUID.toUpperCase();
  
  // --- 步骤四: 防重复播放的核心判断 ---
  // 只有当 当前卡片的UID 与 上次触发播放的UID 不同时，才执行操作
  if (currentCardUID != lastCardUID) {
    Serial.print("检测到新标签 UID: ");
    Serial.println(currentCardUID);

    // 更新 lastCardUID 为当前卡的 UID，防止下次循环重复触发
    lastCardUID = currentCardUID;
    
    // 检查DFPlayer并播放音频
    if (dfPlayerInitialized) {
      playAudioForCard(currentCardUID);
    } else {
      Serial.println("检测到标签，但 DFPlayer 尚未就绪，无法播放。");
    }
  }
  
  // --- 步骤五: 让卡片休眠 ---
  // 虽然上面的逻辑已经能防重复，但调用 HaltA 是一个好习惯，
  // 它可以立即让当前卡片进入不活跃状态，使读卡器的状态管理更清晰。
  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();
}

// ------------------- 7. playAudioForCard() 自定义函数 (保持不变) -------------------
void playAudioForCard(String uid) {
  if (uid == "1D 93 C7 0D 0D 10 80") {
    myDFPlayer.playMp3Folder(1);
    Serial.println("正在播放: 音频1");
  } else if (uid == "1D 92 C7 0D 0D 10 80") {
    myDFPlayer.playMp3Folder(2);
    Serial.println("正在播放: 音频2");
  } else if (uid == "1D 91 C7 0D 0D 10 80") {
    myDFPlayer.playMp3Folder(3);
    Serial.println("正在播放: 音频3");
  } else {
    Serial.println("未识别的标签");
  }
}
```
然后往TF卡里面放一些TTS的音频，就完美解决了。唯一不足的地方就是RFID-RC522模块还需要焊一下。成品：
![成品][1]

# 后续改进
我还买了几个2.4GHz的射频模块，但是需要3.3V的电压。Arduino上的接口不够了，所以我还额外买了一个5V->3.3V的降压模块。这家发货真的快，1h之内就发了，所以我明天就得看是研究无线电了。

# 额外彩蛋
那几个NFC贴纸还很多，我在手机上用一个叫`NFC Writer`的软件写了点东西进去，比较好玩的是写一点应用启动。包名推荐：
- `com.netease.dwrg.mi`
- `com.MiHoYo.ys.mi`
> 我也不知道为什么必须要加`.mi`后缀，如果不加我的手机搜不到（vivo/iQOO）

或者你也可以写入一个URL：
- [http://www.pylindex.top/rick/](http://www.pylindex.top/rick/)

明天看看能不能忽悠几个人来试试水。

# 总结
比赛的就这么多，看来比较简单，估计拿个安慰奖。不过我实在不想再耗费脑细胞了，所以就看Gemini的文字功底了，看看它写的介绍能达到什么高度。拿到降压模块我可能还会改进改进，会的话下回再说。

  [1]: https://image.fatcattech.cn/i/2026/05/16/sg6rk0.jpg

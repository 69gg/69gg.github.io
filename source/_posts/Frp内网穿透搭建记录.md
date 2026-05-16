---
title: Frp内网穿透搭建记录
date: 2024-12-27 15:14:00
---

# 第一章 问题发现
在我家里，使用了树莓派连接光猫进行拨号上网上网，并且用[hostadp](https://w1.fi/cgit/hostap/)进行WiFi共享并分发。**However**，这个无论如何没法分发`ipv6`地址。所以，我决定采用一个方法，来让我家里的设备里的服务可以被外网访问。于是乎，我就想到了`frp`。

# 第二章 服务端安装
目前*frp*的最新版本是`v0.61.1`，我们下载最新版至一个文件夹内：
```bash
aria2c "https://github.com/fatedier/frp/releases/download/v0.61.1/frp_0.61.1_linux_arm64.tar.gz" -x 16 -o ./frp_0.61.1_linux_arm64.tar.gz
```

接下来解压这个文件：
```bash
tar -xvzf frp_0.61.1_linux_arm64.tar.gz
rm frp_0.61.1_linux_arm64.tar.gz
cd ./frp_0.61.1_linux_arm64
```

可以看到有以下文件：
```text
├── frpc
├── frpc.toml
├── frps
├── frps.toml
└── LICENSE
```

删除无关文件：
```bash
rm frpc frpc.toml LICENSE frps.toml
```

接下来编辑start.sh：
```text
./frps --bind-port 7000 --dashboard-port 7500 -t 选择一个密码 --dashboard-user 选择一个用户名 --dashboard-pwd 选择一个密码
```

添加执行权限：
```
chmod +x ./start.sh
```

新建screen窗口：
```bash
screen -S frps
```

开启frps服务：
```bash
./start.sh
```

退出screen窗口：
```bash
按下 Crtl + A，接着按 D
```

打开`Server IP:7500`可以进入控制面板，![2024-12-27T12:11:41.png][1]在这个框里输入用户名和密码，这里未涉及，不再作解释。

# 第三章 小结
目前，服务端已经搭建好，可以正常使用，地址为`Server IP:7000`。

** Enjoy It !**

  [1]: http://www.pylindex.top/typecho/usr/uploads/2024/12/1969196990.png

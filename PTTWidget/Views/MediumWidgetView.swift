import SwiftUI

/// 中尺寸桌面小组件视图 (Medium) - 1:1 像素级精准原生重写 (对齐 ptt_widget_medium.js)
public struct MediumWidgetView: View {
    public let accounts: [AccountTraffic]
    
    public init(accounts: [AccountTraffic]) {
        self.accounts = accounts
    }
    
    public var body: some View {
        Group {
            if accounts.count > 1 {
                dualAccountsView(acc1: accounts[0], acc2: accounts[1])
            } else if let acc = accounts.first {
                singleAccountView(acc: acc)
            } else {
                ErrorWidgetView(title: "未配置 Token", message: "请打开 App 添加订阅")
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12) // 对齐 JS: widget.setPadding(12, 14, 12, 14)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(TrafficTheme.widgetBackground)
    }
    
    // MARK: - 双账号分栏仪表盘 (对齐 renderDualMediumWidget: 左右双卡片分栏，去除折行进度条，舒展热力图)
    
    private func dualAccountsView(acc1: AccountTraffic, acc2: AccountTraffic) -> some View {
        HStack(spacing: 8) { // 对齐 JS: cardsSpacing = 8
            mediumCard(acc: acc1, tag: "A1")
            mediumCard(acc: acc2, tag: "A2")
        }
    }
    
    private func mediumCard(acc: AccountTraffic, tag: String) -> some View {
        let statusColor = TrafficTheme.statusColor(remainingGB: acc.remainingGB, usedPercent: acc.usedPercent)
        
        return VStack(alignment: .leading, spacing: 5) {
            // 1. 卡片顶部：账号标识 + 剩余流量 + 重置天数 (对齐 JS cardHeader)
            HStack(spacing: 4) {
                TrafficTag(text: tag, fontSize: 8.5, hPad: 4, vPad: 1, cornerRadius: 3.5)
                
                Text("余\(acc.remainingGB, specifier: "%.1f")G")
                    .font(.system(size: 11.5, weight: .bold))
                    .foregroundStyle(statusColor)
                
                Spacer()
                
                Text("\(acc.resetDaysLeft)天重置")
                    .font(.system(size: 8.5))
                    .foregroundStyle(TrafficTheme.secondaryText)
            }
            
            // 2. 专属每日用量热力图 (居中舒展，无进度条折行干扰)
            if let daily = acc.dailyStats {
                SwiftUIHeatmapView(stats: daily, compact: true, cellSize: 9.5, cellGap: 2.2)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            } else {
                Spacer()
                VStack(spacing: 4) {
                    TrafficProgressBar(percent: acc.usedPercent, height: 6.0, customColor: statusColor)
                    HStack {
                        Text("用 \(acc.usedGB, specifier: "%.1f") / \(acc.totalGB, specifier: "%.0f")G")
                            .font(.system(size: 8.5))
                            .foregroundStyle(TrafficTheme.secondaryText)
                        Spacer()
                        Text("\(acc.usedPercent)%")
                            .font(.system(size: 8.5))
                            .foregroundStyle(TrafficTheme.secondaryText)
                    }
                }
                Spacer()
            }
        }
        .padding(8) // 对齐 JS: card.setPadding(8, 8, 8, 8)
        .background(TrafficTheme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 10)) // 对齐 JS: card.cornerRadius = 10
    }
    
    // MARK: - 单账号模式 (对齐 renderMediumWidget: 左侧关键指标 + 右侧每日热力图)
    
    private func singleAccountView(acc: AccountTraffic) -> some View {
        let statusColor = TrafficTheme.statusColor(remainingGB: acc.remainingGB, usedPercent: acc.usedPercent)
        
        return VStack(alignment: .leading, spacing: 6) {
            // 顶部行：套餐名 + 重置天数 (对齐 JS topRow)
            HStack {
                Text(acc.planName)
                    .font(.system(size: 13.5, weight: .bold))
                    .foregroundStyle(TrafficTheme.primaryText)
                    .lineLimit(1)
                
                Spacer()
                
                TrafficResetBadge(text: "\(acc.resetDaysLeft)天后重置", fontSize: 9.5, hPad: 6.0, vPad: 2.0, cornerRadius: 5.0)
            }
            
            // 主体行：左侧卡片 + 右侧热力图 (对齐 JS bodyRow)
            HStack(spacing: 10) {
                // 左侧指标卡片 (对齐 JS leftCard: 115 x 86)
                VStack(alignment: .leading, spacing: 0) {
                    Text("剩余流量")
                        .font(.system(size: 9.0))
                        .foregroundStyle(TrafficTheme.secondaryText)
                    
                    Spacer(minLength: 2)
                    
                    HStack(alignment: .firstTextBaseline, spacing: 2) {
                        Text("\(acc.remainingGB, specifier: "%.1f")")
                            .font(.system(size: 19, weight: .bold, design: .rounded))
                            .foregroundStyle(statusColor)
                        Text("GB")
                            .font(.system(size: 9.5, weight: .bold))
                            .foregroundStyle(statusColor)
                    }
                    
                    Spacer(minLength: 4)
                    
                    TrafficProgressBar(percent: acc.usedPercent, height: 4.0, customColor: statusColor)
                    
                    Spacer(minLength: 4)
                    
                    Text("已用 \(acc.usedPercent)%")
                        .font(.system(size: 8.5))
                        .foregroundStyle(TrafficTheme.secondaryText)
                }
                .padding(9)
                .frame(width: 115, height: 86)
                .background(TrafficTheme.cardBackground)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                
                // 右侧热力图
                if let daily = acc.dailyStats {
                    SwiftUIHeatmapView(stats: daily, compact: false, cellSize: 10.5, cellGap: 2.5)
                        .frame(maxWidth: .infinity, maxHeight: 86, alignment: .center)
                } else {
                    Spacer()
                }
            }
        }
    }
}

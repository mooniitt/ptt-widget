import SwiftUI

/// 小尺寸桌面小组件视图 (Small) - 1:1 像素级精准原生重写 (对齐 ptt_widget_small.js)
public struct SmallWidgetView: View {
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
        .padding(12) // 对齐 JS: widget.setPadding(12, 12, 12, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(TrafficTheme.widgetBackground)
    }
    
    // MARK: - 双账号上下双卡片堆叠模式 (对齐 renderDualSmallWidget)
    
    private func dualAccountsView(acc1: AccountTraffic, acc2: AccountTraffic) -> some View {
        VStack(spacing: 6) { // 对齐 JS: 卡片之间间隔 6pt
            accountCard(acc: acc1, tag: "A1")
            accountCard(acc: acc2, tag: "A2")
        }
    }
    
    private func accountCard(acc: AccountTraffic, tag: String) -> some View {
        let statusColor = TrafficTheme.statusColor(remainingGB: acc.remainingGB, usedPercent: acc.usedPercent)
        
        return VStack(alignment: .leading, spacing: 0) {
            // 行 1: 标签 + 剩余量 + 重置天数 (对齐 JS r1)
            HStack(spacing: 4) {
                TrafficTag(text: tag, fontSize: 8.5, hPad: 4, vPad: 1, cornerRadius: 3.0)
                
                Text("余\(acc.remainingGB, specifier: "%.1f")G")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(statusColor)
                
                Spacer()
                
                Text("\(acc.resetDaysLeft)d")
                    .font(.system(size: 8.5))
                    .foregroundStyle(TrafficTheme.secondaryText)
            }
            
            Spacer(minLength: 4)
            
            // 行 2: 细进度条 + 百分比 (对齐 JS r2)
            HStack(spacing: 4) {
                TrafficProgressBar(percent: acc.usedPercent, height: 3.5, customColor: statusColor)
                
                Text("\(acc.usedPercent)%")
                    .font(.system(size: 8))
                    .foregroundStyle(TrafficTheme.secondaryText)
                    .frame(width: 24, alignment: .trailing)
            }
            
            Spacer(minLength: 3)
            
            // 行 3: 配额一览 (对齐 JS r3)
            HStack {
                Text("用 \(acc.usedGB, specifier: "%.1f") / \(acc.totalGB, specifier: "%.0f")G")
                    .font(.system(size: 8))
                    .foregroundStyle(TrafficTheme.secondaryText)
                Spacer()
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 7) // 对齐 JS: card.setPadding(7, 8, 7, 8)
        .background(TrafficTheme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 8)) // 对齐 JS: card.cornerRadius = 8
    }
    
    // MARK: - 单账号模式 (对齐 renderSmallWidget 经典大字看板)
    
    private func singleAccountView(acc: AccountTraffic) -> some View {
        let statusColor = TrafficTheme.statusColor(remainingGB: acc.remainingGB, usedPercent: acc.usedPercent)
        
        return VStack(alignment: .leading, spacing: 0) {
            // 顶部行：套餐名称 + 重置倒计时 (对齐 JS topRow)
            HStack {
                Text(acc.planName)
                    .font(.system(size: 11.5, weight: .bold))
                    .foregroundStyle(TrafficTheme.primaryText)
                    .lineLimit(1)
                
                Spacer()
                
                TrafficResetBadge(text: "\(acc.resetDaysLeft)d", fontSize: 9.0, hPad: 5.0, vPad: 1.5, cornerRadius: 4.0)
            }
            
            Spacer(minLength: 8)
            
            // 核心剩余流量标题
            Text("剩余流量")
                .font(.system(size: 9.5))
                .foregroundStyle(TrafficTheme.secondaryText)
            
            Spacer(minLength: 2)
            
            // 核心数值 (对齐 JS valStack: 27 bold + 11 bold)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text("\(acc.remainingGB, specifier: "%.1f")")
                    .font(.system(size: 27, weight: .bold, design: .rounded))
                    .foregroundStyle(statusColor)
                Text("GB")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(statusColor)
            }
            
            Spacer(minLength: 6)
            
            // 细进度条 (对齐 JS: 高度 4.5pt)
            TrafficProgressBar(percent: acc.usedPercent, height: 4.5, customColor: statusColor)
            
            Spacer(minLength: 7)
            
            // 底部用量行 (对齐 JS footRow)
            HStack {
                Text("用 \(acc.usedGB, specifier: "%.1f") / \(acc.totalGB, specifier: "%.0f")G")
                    .font(.system(size: 9))
                    .foregroundStyle(TrafficTheme.secondaryText)
                
                Spacer()
                
                Text("\(acc.usedPercent)%")
                    .font(.system(size: 9))
                    .foregroundStyle(TrafficTheme.secondaryText)
            }
        }
    }
}

import SwiftUI

/// 大尺寸桌面小组件视图 (Large) - 1:1 像素级精准原生重写 (对齐 ptt_widget_large.js)
public struct LargeWidgetView: View {
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
    
    // MARK: - 双账号全景专属仪表盘 (对齐 renderDualLargeWidget)
    
    private func dualAccountsView(acc1: AccountTraffic, acc2: AccountTraffic) -> some View {
        let minResetDays = min(acc1.resetDaysLeft, acc2.resetDaysLeft)
        
        return VStack(spacing: 0) {
            // 1. 顶部简洁汇总行 (对齐 JS headerStack)
            HStack {
                Text("流量监控")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(TrafficTheme.primaryText)
                
                Spacer()
                
                TrafficResetBadge(text: "双账号 · \(minResetDays)天后重置", fontSize: 11.0, hPad: 8.0, vPad: 3.0, cornerRadius: 6.0)
            }
            
            Spacer(minLength: 8)
            
            // 2. 中部：双账号指标对比卡片 (左右并列，对齐 JS compareStack)
            HStack(spacing: 8) {
                metricCard(acc: acc1, tag: "A1")
                metricCard(acc: acc2, tag: "A2")
            }
            
            Spacer(minLength: 8)
            
            // 3. 下部：双账号每日用量双热力图 (左右并列，对齐 JS chartsStack)
            HStack(spacing: 8) {
                heatmapCard(acc: acc1)
                heatmapCard(acc: acc2)
            }
            
            Spacer(minLength: 8)
            
            // 4. 底部轻量状态栏 (对齐 JS footerStack)
            HStack {
                Text(Date(), style: .time)
                    .font(.system(size: 9.5))
                    .foregroundStyle(TrafficTheme.secondaryText)
                
                Spacer()
                
                HStack(spacing: 4) {
                    Circle()
                        .fill(TrafficTheme.trafficGreen)
                        .frame(width: 6, height: 6)
                    Text("数据已同步")
                        .font(.system(size: 9.5))
                        .foregroundStyle(TrafficTheme.secondaryText)
                }
            }
        }
    }
    
    private func metricCard(acc: AccountTraffic, tag: String) -> some View {
        let statusColor = TrafficTheme.statusColor(remainingGB: acc.remainingGB, usedPercent: acc.usedPercent)
        
        return VStack(alignment: .leading, spacing: 0) {
            // 卡片顶部：A1 / A2 标 + 重置天数 (对齐 JS r1)
            HStack {
                TrafficTag(text: tag, fontSize: 9.5, hPad: 6, vPad: 2, cornerRadius: 4.0)
                Spacer()
                Text("\(acc.resetDaysLeft)天后重置")
                    .font(.system(size: 9.5))
                    .foregroundStyle(TrafficTheme.secondaryText)
            }
            
            Spacer(minLength: 6)
            
            // 核心剩余大字 (对齐 JS valRow)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text("剩余 ")
                    .font(.system(size: 10.5))
                    .foregroundStyle(TrafficTheme.secondaryText)
                
                Text("\(acc.remainingGB, specifier: "%.1f")")
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .foregroundStyle(statusColor)
                
                Text("GB")
                    .font(.system(size: 10.5, weight: .bold))
                    .foregroundStyle(statusColor)
                
                Spacer()
                
                Text("\(acc.usedPercent)%")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(TrafficTheme.secondaryText)
            }
            
            Spacer(minLength: 5)
            
            // 进度条 (对齐 JS: 5.5pt)
            TrafficProgressBar(percent: acc.usedPercent, height: 5.5, customColor: statusColor)
            
            Spacer(minLength: 6)
            
            // 底部用量与今日统计 (对齐 JS r2)
            HStack {
                Text("用 \(acc.usedGB, specifier: "%.1f") / \(acc.totalGB, specifier: "%.0f")G")
                    .font(.system(size: 9.5))
                    .foregroundStyle(TrafficTheme.secondaryText)
                
                Spacer()
                
                if let daily = acc.dailyStats {
                    Text("今日 \(daily.todayGB, specifier: "%.1f")G")
                        .font(.system(size: 9.5))
                        .foregroundStyle(daily.isTodayWarning ? TrafficTheme.trafficRed : TrafficTheme.secondaryText)
                }
            }
        }
        .padding(10) // 对齐 JS: card.setPadding(11, 11, 11, 11)
        .background(TrafficTheme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 11))
    }
    
    private func heatmapCard(acc: AccountTraffic) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            if let daily = acc.dailyStats {
                SwiftUIHeatmapView(stats: daily, compact: true, cellSize: 11.5, cellGap: 2.8)
                    .frame(maxWidth: .infinity, alignment: .center)
            } else {
                Spacer()
                Text("暂无当月记录")
                    .font(.system(size: 9.5))
                    .foregroundStyle(TrafficTheme.secondaryText)
                Spacer()
            }
        }
        .padding(8) // 对齐 JS: chartCard.setPadding(8, 8, 8, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(TrafficTheme.cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 11))
    }
    
    // MARK: - 单账号模式 (对齐 renderLargeWidget)
    
    private func singleAccountView(acc: AccountTraffic) -> some View {
        let statusColor = TrafficTheme.statusColor(remainingGB: acc.remainingGB, usedPercent: acc.usedPercent)
        
        return VStack(alignment: .leading, spacing: 8) {
            // 顶部栏
            HStack {
                Text(acc.planName)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(TrafficTheme.primaryText)
                Spacer()
                TrafficResetBadge(text: "\(acc.resetDaysLeft) 天后重置", fontSize: 10.5, hPad: 8, vPad: 3, cornerRadius: 6)
            }
            
            // 核心指标卡
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("剩余流量")
                            .font(.system(size: 10))
                            .foregroundStyle(TrafficTheme.secondaryText)
                        HStack(spacing: 2) {
                            Text("\(acc.remainingGB, specifier: "%.1f")")
                                .font(.system(size: 26, weight: .bold, design: .rounded))
                                .foregroundStyle(statusColor)
                            Text("GB")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(statusColor)
                        }
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("总量 \(acc.totalGB, specifier: "%.0f") GB")
                            .font(.system(size: 11, weight: .medium))
                        Text("已用 \(acc.usedGB, specifier: "%.1f") GB (\(acc.usedPercent)%)")
                            .font(.system(size: 10))
                            .foregroundStyle(TrafficTheme.secondaryText)
                    }
                }
                
                TrafficProgressBar(percent: acc.usedPercent, height: 6.0, customColor: statusColor)
            }
            .padding(10)
            .background(TrafficTheme.cardBackground)
            .clipShape(RoundedRectangle(cornerRadius: 11))
            
            // 下方热力图
            if let daily = acc.dailyStats {
                SwiftUIHeatmapView(stats: daily, compact: false, cellSize: 12.5, cellGap: 3.2)
                    .padding(8)
                    .background(TrafficTheme.cardBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 11))
            }
            
            Spacer()
            
            // 底部栏
            HStack {
                Text("到期: \(acc.expireDateStr)")
                    .font(.system(size: 9.5))
                    .foregroundStyle(TrafficTheme.secondaryText)
                Spacer()
                Text("正常运行")
                    .font(.system(size: 9.5))
                    .foregroundStyle(TrafficTheme.secondaryText)
            }
        }
    }
}

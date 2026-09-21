import SwiftUI

/// 中尺寸桌面小组件视图 (Medium)
public struct MediumWidgetView: View {
    public let accounts: [AccountTraffic]
    
    public init(accounts: [AccountTraffic]) {
        self.accounts = accounts
    }
    
    public var body: some View {
        if accounts.count > 1 {
            dualAccountsView(acc1: accounts[0], acc2: accounts[1])
        } else if let acc = accounts.first {
            singleAccountView(acc: acc)
        } else {
            emptyView
        }
    }
    
    // MARK: - 双账号分栏仪表盘 (无进度条挤压，下半部舒展呈现完整热力图)
    
    private func dualAccountsView(acc1: AccountTraffic, acc2: AccountTraffic) -> some View {
        HStack(spacing: 8) {
            mediumCard(acc: acc1, tag: "A1")
            mediumCard(acc: acc2, tag: "A2")
        }
    }
    
    private func mediumCard(acc: AccountTraffic, tag: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            // 顶部信息行
            HStack {
                Text(tag)
                    .font(.system(size: 9, weight: .bold))
                    .padding(.horizontal, 5)
                    .padding(.vertical, 1.5)
                    .background(Color(uiColor: .systemGray5))
                    .clipShape(RoundedRectangle(cornerRadius: 3.5))
                
                Text("余 \(acc.remainingGB, specifier: "%.1f")G")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(acc.isWarning ? .red : .green)
                
                Spacer()
                
                Text("\(acc.resetDaysLeft)天重置")
                    .font(.system(size: 8.5))
                    .foregroundStyle(.secondary)
            }
            
            // 下半部舒展呈现热力图
            if let daily = acc.dailyStats {
                SwiftUIHeatmapView(stats: daily, compact: true, cellSize: 9.5, cellGap: 2.5)
                    .frame(maxWidth: .infinity, alignment: .center)
            } else {
                Spacer()
                Text("用 \(acc.usedGB, specifier: "%.1f") / \(acc.totalGB, specifier: "%.0f") GB")
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
                Spacer()
            }
        }
        .padding(7)
        .background(Color(uiColor: .secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
    
    // MARK: - 单账号模式 (左侧核心指标，右侧完整热力图)
    
    private func singleAccountView(acc: AccountTraffic) -> some View {
        HStack(spacing: 10) {
            // 左侧卡片
            VStack(alignment: .leading, spacing: 3) {
                Text(acc.planName)
                    .font(.system(size: 11, weight: .bold))
                    .lineLimit(1)
                
                Text("\(acc.resetDaysLeft) 天后重置")
                    .font(.system(size: 8.5))
                    .foregroundStyle(.blue)
                
                Spacer()
                
                Text("剩余流量")
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
                
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                    Text("\(acc.remainingGB, specifier: "%.1f")")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(acc.isWarning ? .red : .green)
                    Text("GB")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(acc.isWarning ? .red : .green)
                }
                
                Text("用 \(acc.usedGB, specifier: "%.1f") / \(acc.totalGB, specifier: "%.0f") GB (\(acc.usedPercent)%)")
                    .font(.system(size: 8))
                    .foregroundStyle(.secondary)
            }
            .frame(width: 120)
            
            Divider()
            
            // 右侧热力图
            if let daily = acc.dailyStats {
                SwiftUIHeatmapView(stats: daily, compact: false, cellSize: 10.5, cellGap: 2.8)
            } else {
                Spacer()
            }
        }
        .padding(4)
    }
    
    private var emptyView: some View {
        VStack(spacing: 4) {
            Text("暂无数据")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(.red)
            Text("请在 App 中配置 Token")
                .font(.system(size: 9))
                .foregroundStyle(.secondary)
        }
    }
}

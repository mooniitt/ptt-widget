import SwiftUI

/// 小尺寸桌面小组件视图 (Small)
public struct SmallWidgetView: View {
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
    
    // MARK: - 双账号上下双卡片堆叠模式
    
    private func dualAccountsView(acc1: AccountTraffic, acc2: AccountTraffic) -> some View {
        VStack(spacing: 5) {
            accountCard(acc: acc1, tag: "A1")
            accountCard(acc: acc2, tag: "A2")
        }
    }
    
    private func accountCard(acc: AccountTraffic, tag: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(tag)
                    .font(.system(size: 8.5, weight: .bold))
                    .padding(.horizontal, 4)
                    .padding(.vertical, 1.5)
                    .background(Color(uiColor: .systemGray5))
                    .clipShape(RoundedRectangle(cornerRadius: 3.5))
                
                Spacer()
                
                Text("\(acc.remainingGB, specifier: "%.1f")G")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(acc.isWarning ? .red : .green)
                
                Text("· \(acc.resetDaysLeft)d")
                    .font(.system(size: 8.5))
                    .foregroundStyle(.secondary)
            }
            
            // 进度条
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color(uiColor: .systemGray5))
                    Capsule()
                        .fill(acc.isWarning ? Color.red : Color.green)
                        .frame(width: geo.size.width * CGFloat(min(1.0, Double(acc.usedPercent) / 100.0)))
                }
            }
            .frame(height: 3.5)
            
            HStack {
                Text("用 \(acc.usedGB, specifier: "%.1f") / \(acc.totalGB, specifier: "%.0f")G")
                    .font(.system(size: 7.5))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(acc.usedPercent)%")
                    .font(.system(size: 7.5, weight: .medium))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(6)
        .background(Color(uiColor: .secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
    
    // MARK: - 单账号模式
    
    private func singleAccountView(acc: AccountTraffic) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(acc.planName)
                    .font(.system(size: 10.5, weight: .bold))
                    .lineLimit(1)
                Spacer()
                Text("\(acc.resetDaysLeft)d")
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
            }
            
            Spacer()
            
            Text("剩余流量")
                .font(.system(size: 9))
                .foregroundStyle(.secondary)
            
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text("\(acc.remainingGB, specifier: "%.1f")")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(acc.isWarning ? .red : .green)
                Text("GB")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(acc.isWarning ? .red : .green)
            }
            
            // 进度条
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color(uiColor: .systemGray5))
                    Capsule()
                        .fill(acc.isWarning ? Color.red : Color.green)
                        .frame(width: geo.size.width * CGFloat(min(1.0, Double(acc.usedPercent) / 100.0)))
                }
            }
            .frame(height: 4.5)
            
            HStack {
                Text("用 \(acc.usedGB, specifier: "%.1f") / \(acc.totalGB, specifier: "%.0f")G")
                    .font(.system(size: 8))
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(acc.usedPercent)%")
                    .font(.system(size: 8, weight: .medium))
                    .foregroundStyle(.secondary)
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

import SwiftUI

/// 纯 SwiftUI 原生矢量渲染 GitHub 贡献风格周期热力图
public struct SwiftUIHeatmapView: View {
    public let stats: DailyStats
    public var compact: Bool = false
    public var cellSize: CGFloat = 11.5
    public var cellGap: CGFloat = 3.0
    
    private let weekLabels = ["一", "二", "三", "四", "五", "六", "日"]
    
    public init(stats: DailyStats, compact: Bool = false, cellSize: CGFloat = 11.5, cellGap: CGFloat = 3.0) {
        self.stats = stats
        self.compact = compact
        self.cellSize = cellSize
        self.cellGap = cellGap
    }
    
    // 周一为 0，周日为 6
    private var firstDayCol: Int {
        // stats.firstDayOfWeek: 1 (周日), 2 (周一)...
        return (stats.firstDayOfWeek + 5) % 7
    }
    
    public var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            // 1. 顶部周期范围标签
            HStack {
                Text(stats.cycleRangeLabel)
                    .font(.system(size: compact ? 8.5 : 9.5, weight: .bold))
                    .foregroundStyle(.primary)
                Spacer()
                if !compact {
                    Text(stats.isTodayWarning ? "今日用量超标 ⚠️" : "热力分布")
                        .font(.system(size: 8.5))
                        .foregroundStyle(stats.isTodayWarning ? .red : .secondary)
                }
            }
            
            // 2. 星期横轴表头 (一 至 日)
            HStack(spacing: cellGap) {
                ForEach(0..<7, id: \.self) { c in
                    Text(weekLabels[c])
                        .font(.system(size: compact ? 7.5 : 8.5, weight: .medium))
                        .foregroundStyle(.secondary)
                        .frame(width: cellSize, alignment: .center)
                }
            }
            
            // 3. 自然周历网格矩阵
            let totalCells = firstDayCol + stats.cells.count
            let totalRows = Int(ceil(Double(totalCells) / 7.0))
            
            VStack(spacing: cellGap) {
                ForEach(0..<totalRows, id: \.self) { row in
                    HStack(spacing: cellGap) {
                        ForEach(0..<7, id: \.self) { col in
                            let cellIndex = row * 7 + col - firstDayCol
                            if cellIndex >= 0 && cellIndex < stats.cells.count {
                                let item = stats.cells[cellIndex]
                                cellView(item: item)
                            } else {
                                // 留白占位方块
                                Color.clear
                                    .frame(width: cellSize, height: cellSize)
                            }
                        }
                    }
                }
            }
        }
    }
    
    @ViewBuilder
    private func cellView(item: HeatmapCell) -> some View {
        RoundedRectangle(cornerRadius: max(2, cellSize * 0.22))
            .fill(cellColor(for: item))
            .frame(width: cellSize, height: cellSize)
            .overlay {
                if item.isToday {
                    RoundedRectangle(cornerRadius: max(2, cellSize * 0.22))
                        .strokeBorder(item.isWarning ? Color.red : Color.blue, lineWidth: 1.5)
                }
            }
    }
    
    private func cellColor(for item: HeatmapCell) -> Color {
        if item.isWarning {
            return Color(red: 1.0, green: 0.30, blue: 0.31) // 珊瑚警示红
        }
        switch item.level {
        case 1:
            return Color(red: 0.61, green: 0.91, blue: 0.66) // 浅绿
        case 2:
            return Color(red: 0.25, green: 0.77, blue: 0.39) // 中浅绿
        case 3:
            return Color(red: 0.19, green: 0.63, blue: 0.31) // 中深绿
        case 4:
            return Color(red: 0.13, green: 0.43, blue: 0.22) // 深绿
        default:
            return Color(uiColor: .systemGray5)             // 浅微灰
        }
    }
}

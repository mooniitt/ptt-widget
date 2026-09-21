import SwiftUI

/// 纯 SwiftUI 原生矢量渲染 GitHub 贡献风格周期热力图 (1:1 对齐 drawMonthHeatmapChart)
public struct SwiftUIHeatmapView: View {
    public let stats: DailyStats
    public var compact: Bool = false
    public var cellSize: CGFloat = 11.5
    public var cellGap: CGFloat = 2.5
    
    private let weekLabels = ["一", "二", "三", "四", "五", "六", "日"]
    
    public init(stats: DailyStats, compact: Bool = false, cellSize: CGFloat = 11.5, cellGap: CGFloat = 2.5) {
        self.stats = stats
        self.compact = compact
        self.cellSize = cellSize
        self.cellGap = cellGap
    }
    
    // 周一为 0，周日为 6 (对齐 JS: (firstDayOfWeek + 6) % 7)
    private var firstDayCol: Int {
        // stats.firstDayOfWeek: 1(周日), 2(周一)...
        return (stats.firstDayOfWeek + 5) % 7
    }
    
    public var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            // 1. 顶部周期范围标签 (对齐 JS)
            HStack {
                Text(stats.cycleRangeLabel)
                    .font(.system(size: compact ? 8.5 : 9.5, weight: .bold))
                    .foregroundStyle(TrafficTheme.primaryText)
                    .lineLimit(1)
                
                Spacer()
                
                if !compact {
                    Text(stats.isTodayWarning ? "今日超标 ⚠️" : "")
                        .font(.system(size: 8.5, weight: .bold))
                        .foregroundStyle(TrafficTheme.trafficRed)
                }
            }
            .frame(height: compact ? 11 : 13)
            
            // 2. 星期横轴表头 (一 至 日，对齐 JS)
            HStack(spacing: cellGap) {
                ForEach(0..<7, id: \.self) { c in
                    Text(weekLabels[c])
                        .font(.system(size: compact ? 7.5 : 8.5))
                        .foregroundStyle(TrafficTheme.secondaryText)
                        .frame(width: cellSize, alignment: .center)
                }
            }
            .frame(height: compact ? 9 : 11)
            
            // 3. 自然周历网格矩阵 (对齐 JS 绘制逻辑)
            let totalCells = firstDayCol + stats.cells.count
            let totalRows = Int(ceil(Double(totalCells) / 7.0))
            let cornerRadius = max(2.0, cellSize * 0.22)
            
            VStack(spacing: cellGap) {
                ForEach(0..<totalRows, id: \.self) { row in
                    HStack(spacing: cellGap) {
                        ForEach(0..<7, id: \.self) { col in
                            let cellIndex = row * 7 + col - firstDayCol
                            if cellIndex >= 0 && cellIndex < stats.cells.count {
                                let item = stats.cells[cellIndex]
                                cellView(item: item, cornerRadius: cornerRadius)
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
    private func cellView(item: HeatmapCell, cornerRadius: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: cornerRadius)
            .fill(cellColor(for: item))
            .frame(width: cellSize, height: cellSize)
            .overlay {
                if item.isToday {
                    RoundedRectangle(cornerRadius: cornerRadius + 0.5)
                        .strokeBorder(item.isWarning ? TrafficTheme.trafficRed : TrafficTheme.badgeBlue, lineWidth: 1.5)
                        .padding(-0.75)
                }
            }
    }
    
    private func cellColor(for item: HeatmapCell) -> Color {
        if item.isWarning {
            return TrafficTheme.heatmapWarning
        }
        let lvl = max(0, min(4, item.level))
        return TrafficTheme.heatmapLevels[lvl]
    }
}

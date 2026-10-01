import { Fragment, useState, type ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string | number;
  empty?: string;
  onRowClick?: (row: T) => void;
  /** Contenu affiche sous la ligne lorsqu'elle est deployee (tableau expandable). */
  renderExpanded?: (row: T) => ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  onRowClick,
  renderExpanded,
}: DataTableProps<T>) {
  const [open, setOpen] = useState<Set<string | number>>(new Set());
  const toggle = (key: string | number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (rows.length === 0) {
    return <p className="empty">{empty ?? 'Aucune donnée.'}</p>;
  }
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {renderExpanded ? <th style={{ width: 28 }} /> : null}
            {columns.map((col) => (
              <th key={col.key} style={{ textAlign: col.align ?? 'left' }} className={col.className}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const key = rowKey(row, index);
            const isOpen = open.has(key);
            return (
              <Fragment key={key}>
                <tr
                  onClick={renderExpanded ? () => toggle(key) : onRowClick ? () => onRowClick(row) : undefined}
                  className={onRowClick || renderExpanded ? 'clickable' : undefined}
                >
                  {renderExpanded ? <td>{isOpen ? '▾' : '▸'}</td> : null}
                  {columns.map((col) => (
                    <td key={col.key} style={{ textAlign: col.align ?? 'left' }} className={col.className}>
                      {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
                {renderExpanded && isOpen ? (
                  <tr className="expanded-row">
                    <td colSpan={columns.length + 1}>{renderExpanded(row)}</td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

"""
PDF Generation Service for Invoice Final Approval Reports.

Generates a detailed PDF combining:
  - Invoice summary
  - Workflow history (from workflow_steps table)
  - Audit trail (from audit_logs table)

Uses ReportLab for PDF rendering.
Saves the output to the local 'output/' directory.
"""

import os
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import asc

# Use the app's logger
logger = logging.getLogger("ai_app")

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm, mm
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        HRFlowable, KeepTogether, PageBreak
    )
    from reportlab.platypus.flowables import HRFlowable
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False

# ─── Output directory ────────────────────────────────────────────────────────
OUTPUT_DIR = Path(__file__).resolve().parent.parent.parent / "output"


if REPORTLAB_AVAILABLE:
    # ─── Color palette ───────────────────────────────────────────────────────────
    PRIMARY   = colors.HexColor("#1a3c5e")   # Deep navy
    SECONDARY = colors.HexColor("#2e7bcf")   # Bright blue accent
    SUCCESS   = colors.HexColor("#1d7a4e")   # Green for approved
    WARNING   = colors.HexColor("#b35c00")   # Amber for pending/rework
    DANGER    = colors.HexColor("#9b1c1c")   # Red for rejected
    LIGHT_BG  = colors.HexColor("#f1f5f9")   # Light grey background
    HEADER_BG = colors.HexColor("#1a3c5e")   # Table header background
    ROW_ALT   = colors.HexColor("#edf2f7")   # Alternating row
    WHITE     = colors.white
    BLACK     = colors.HexColor("#1a202c")
else:
    # Fallback to strings or None if reportlab is not available
    PRIMARY = SECONDARY = SUCCESS = WARNING = DANGER = LIGHT_BG = HEADER_BG = ROW_ALT = WHITE = BLACK = colors = None


def _status_color(status: str):
    if not REPORTLAB_AVAILABLE:
        return None
    s = (status or "").lower()
    if "approved" in s:
        return SUCCESS
    if "rejected" in s:
        return DANGER
    if "rework" in s:
        return WARNING
    return colors.HexColor("#4a5568")


def _fmt_dt(dt: Optional[datetime]) -> str:
    if dt is None:
        return "—"
    dt_ist = dt + timedelta(hours=5, minutes=30)
    return dt_ist.strftime("%d %b %Y  %I:%M %p IST")


def _safe_str(val, default="—") -> str:
    if val is None or val == "":
        return default
    return str(val)


def _truncate(text: str, limit: int = 60) -> str:
    if not text:
        return "—"
    text = str(text)
    return (text[:limit] + "…") if len(text) > limit else text


def _extract_total(extracted_data_str) -> str:
    """Pull total invoice amount from the extracted_data JSON."""
    try:
        if not extracted_data_str:
            return "—"
        data = json.loads(extracted_data_str) if isinstance(extracted_data_str, str) else extracted_data_str
        amt = data.get("amounts", {}).get("total_invoice_amount", {}).get("value")
        if amt:
            return str(amt)
        # Fallback paths
        for key in ["Total Invoice Amount", "TotalAmount", "InvoiceTotal"]:
            v = data.get(key, {}).get("value")
            if v:
                return str(v)
        return "—"
    except Exception:
        return "—"


def _extract_currency(extracted_data_str) -> str:
    try:
        if not extracted_data_str:
            return ""
        data = json.loads(extracted_data_str) if isinstance(extracted_data_str, str) else extracted_data_str
        return data.get("invoice_details", {}).get("currency", {}).get("value", "")
    except Exception:
        return ""


def _extract_invoice_date(extracted_data_str) -> str:
    try:
        if not extracted_data_str:
            return "—"
        data = json.loads(extracted_data_str) if isinstance(extracted_data_str, str) else extracted_data_str
        v = data.get("invoice_details", {}).get("invoice_date", {}).get("value")
        return _safe_str(v)
    except Exception:
        return "—"


def _extract_po(extracted_data_str) -> str:
    try:
        if not extracted_data_str:
            return "—"
        data = json.loads(extracted_data_str) if isinstance(extracted_data_str, str) else extracted_data_str
        v = data.get("invoice_details", {}).get("po_number", {}).get("value")
        return _safe_str(v)
    except Exception:
        return "—"


# ─── Page decoration (header/footer on every page) ───────────────────────────
def _page_template(canvas, doc):
    canvas.saveState()
    page_w, page_h = A4

    # Top banner
    canvas.setFillColor(PRIMARY)
    canvas.rect(0, page_h - 28 * mm, page_w, 28 * mm, fill=1, stroke=0)

    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica-Bold", 13)
    canvas.drawString(18 * mm, page_h - 14 * mm, "Accounts Payable — Final Approval Report")

    canvas.setFont("Helvetica", 9)
    dt_now_ist = datetime.utcnow() + timedelta(hours=5, minutes=30)
    canvas.drawRightString(page_w - 18 * mm, page_h - 14 * mm,
                           f"Generated: {dt_now_ist.strftime('%d %b %Y  %I:%M %p IST')}")

    # Accent stripe
    canvas.setFillColor(SECONDARY)
    canvas.rect(0, page_h - 30 * mm, page_w, 2 * mm, fill=1, stroke=0)

    # Bottom footer
    canvas.setFillColor(PRIMARY)
    canvas.rect(0, 0, page_w, 12 * mm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(18 * mm, 4 * mm,
                      "CONFIDENTIAL — Final Approval Document — For Internal Use Only")
    canvas.drawRightString(page_w - 18 * mm, 4 * mm,
                           f"Page {doc.page}")

    canvas.restoreState()


# ─── Section heading helper ───────────────────────────────────────────────────
def _section_heading(title: str, styles) -> list:
    style = ParagraphStyle(
        "SectionHeading",
        parent=styles["Normal"],
        fontSize=11,
        textColor=WHITE,
        backColor=PRIMARY,
        spaceAfter=0,
        spaceBefore=6,
        leftIndent=6,
        leading=18,
        fontName="Helvetica-Bold",
    )
    return [
        Spacer(1, 8),
        Paragraph(f"  {title}", style),
        Spacer(1, 4),
    ]


# ─── Summary key-value table ──────────────────────────────────────────────────
def _kv_table(rows: list, col_widths=None) -> Table:
    """Two-column label → value table for the invoice summary."""
    if col_widths is None:
        col_widths = [5 * cm, 11 * cm]

    styled_rows = []
    for i, (lbl, val) in enumerate(rows):
        bg = ROW_ALT if i % 2 == 0 else WHITE
        styled_rows.append([
            Paragraph(f"<b>{lbl}</b>", ParagraphStyle("lbl", fontSize=8.5, textColor=BLACK, fontName="Helvetica-Bold")),
            Paragraph(_safe_str(val), ParagraphStyle("val", fontSize=8.5, textColor=BLACK, fontName="Helvetica")),
        ])

    tbl = Table(styled_rows, colWidths=col_widths, repeatRows=0)
    style = TableStyle([
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [ROW_ALT, WHITE]),
        ("BOX",            (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e0")),
        ("INNERGRID",      (0, 0), (-1, -1), 0.3, colors.HexColor("#e2e8f0")),
        ("TOPPADDING",     (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING",  (0, 0), (-1, -1), 4),
        ("LEFTPADDING",    (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",   (0, 0), (-1, -1), 6),
    ])
    tbl.setStyle(style)
    return tbl


# ─── Generic data table ───────────────────────────────────────────────────────
def _data_table(headers: list, rows: list, col_widths: list, status_col: int = -1) -> Table:
    """Tabular data with styled header row and alternating rows."""
    h_cells = [
        Paragraph(f"<b>{h}</b>", ParagraphStyle(
            "th", fontSize=8, textColor=WHITE, fontName="Helvetica-Bold", alignment=TA_CENTER
        ))
        for h in headers
    ]
    table_data = [h_cells]

    for i, row in enumerate(rows):
        cells = []
        for j, cell in enumerate(row):
            align = TA_CENTER if j == 0 else TA_LEFT
            txt = str(cell) if cell is not None else "—"
            # Colour-code status column
            if j == status_col:
                c = _status_color(txt)
                p = Paragraph(
                    f'<font color="#{c.hexval()[2:].upper()}"><b>{txt}</b></font>',
                    ParagraphStyle("st", fontSize=8, alignment=TA_CENTER, fontName="Helvetica-Bold")
                )
            else:
                p = Paragraph(txt, ParagraphStyle("td", fontSize=8, alignment=align, fontName="Helvetica"))
            cells.append(p)
        table_data.append(cells)

    tbl = Table(table_data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        # Header
        ("BACKGROUND",    (0, 0), (-1, 0), HEADER_BG),
        ("TEXTCOLOR",     (0, 0), (-1, 0), WHITE),
        # Alternating body rows
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, ROW_ALT]),
        # Borders
        ("BOX",           (0, 0), (-1, -1), 0.6, colors.HexColor("#94a3b8")),
        ("INNERGRID",     (0, 0), (-1, -1), 0.3, colors.HexColor("#e2e8f0")),
        # Padding
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 5),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 5),
        # Header bottom border accent
        ("LINEBELOW",     (0, 0), (-1, 0), 1.5, SECONDARY),
    ]
    tbl.setStyle(TableStyle(style_cmds))
    return tbl


# ─── Main entry point ─────────────────────────────────────────────────────────
def generate_approval_pdf(db: Session, invoice_id: int) -> str:
    """
    Generate a PDF approval report for the given invoice.

    Reads workflow steps and audit trail from SQL Server,
    builds a formatted PDF with ReportLab, and saves it to:
      <project_root>/output/invoice_{invoice_id}_approval.pdf

    Returns the absolute path to the saved PDF.
    """
    logger.info(f"[PDFService] Generating approval PDF for invoice {invoice_id}...")
    if not REPORTLAB_AVAILABLE:
        logger.error("[PDFService] ReportLab is not available!")
        raise ImportError(
            "ReportLab is not installed. Run: pip install reportlab"
        )

    from app.models.db_models import Invoice, WorkflowStep, AuditLog, Coding

    # ── 1. Fetch data from SQL Server ─────────────────────────────────────────
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        logger.error(f"[PDFService] Invoice {invoice_id} not found in DB.")
        raise ValueError(f"Invoice {invoice_id} not found.")

    logger.info(f"[PDFService] Found invoice: {invoice.invoice_number}, fetching workflow and audit logs...")

    workflow_steps = (
        db.query(WorkflowStep)
        .filter(WorkflowStep.invoice_id == invoice_id)
        .order_by(asc(WorkflowStep.timestamp))
        .all()
    )

    audit_logs = (
        db.query(AuditLog)
        .filter(AuditLog.invoice_id == invoice_id)
        .order_by(asc(AuditLog.timestamp))
        .all()
    )

    coding = db.query(Coding).filter(Coding.invoice_id == invoice_id).first()

    # ── 2. Ensure output directory exists ─────────────────────────────────────
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    pdf_path = OUTPUT_DIR / f"invoice_{invoice_id}_approval.pdf"

    # ── 3. Extract readable fields ────────────────────────────────────────────
    extracted_str = invoice.extracted_data
    inv_total    = _extract_total(extracted_str)
    inv_currency = _extract_currency(extracted_str)
    inv_date     = _extract_invoice_date(extracted_str)
    inv_po       = _extract_po(extracted_str)
    amount_str   = f"{inv_currency} {inv_total}".strip() if inv_total != "—" else "—"

    approved_emails = [a.approver_email for a in (invoice.approved_by_list or [])]
    assigned_emails = [
        a.approver_email
        for a in sorted(
            (invoice.assigned_approvers_list or []),
            key=lambda x: x.sequence_order
        )
    ]

    # ── 4. Build PDF story ────────────────────────────────────────────────────
    styles = getSampleStyleSheet()
    page_w, page_h = A4
    margin = 18 * mm

    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=34 * mm,
        bottomMargin=18 * mm,
    )

    story = []

    # ── Reference banner ──────────────────────────────────────────────────────
    banner_style = ParagraphStyle(
        "Banner",
        fontSize=10,
        textColor=SECONDARY,
        fontName="Helvetica-Bold",
        spaceAfter=2,
    )
    sub_style = ParagraphStyle(
        "SubBanner",
        fontSize=8.5,
        textColor=colors.HexColor("#4a5568"),
        fontName="Helvetica",
        spaceAfter=8,
    )

    invoice_ref = _safe_str(invoice.invoice_number, "N/A")
    story.append(Paragraph(
        f"Invoice Reference: {invoice_ref}  ·  ID: {invoice_id}", banner_style
    ))
    story.append(Paragraph(
        f"Entity: {_safe_str(invoice.entity)}  ·  Vendor: {_safe_str(invoice.vendor_name)}  ·  "
        f"Status: <b>FULLY APPROVED</b>", sub_style
    ))
    story.append(HRFlowable(width="100%", thickness=1.5, color=SECONDARY, spaceAfter=6))

    # ─────────────────────────────────────────────────────────────────────────
    # SECTION 1 — Invoice Summary
    # ─────────────────────────────────────────────────────────────────────────
    story += _section_heading("1.  Invoice Summary", styles)

    summary_rows = [
        ("Invoice ID",       invoice_id),
        ("Invoice Number",   _safe_str(invoice.invoice_number)),
        ("Vendor Name",      _safe_str(invoice.vendor_name)),
        ("Vendor ID",        _safe_str(invoice.vendor_id)),
        ("Entity",           _safe_str(invoice.entity)),
        ("Invoice Date",     inv_date),
        ("PO Number",        inv_po),
        ("Total Amount",     amount_str),
        ("Status",           "FULLY APPROVED ✓"),
        ("Uploaded By",      _safe_str(invoice.uploaded_by)),
        ("Upload Date",      _fmt_dt(invoice.uploaded_at)),
        ("Required Approvers",  _safe_str(invoice.required_approvers)),
        ("Assigned Approvers",  ", ".join(assigned_emails) if assigned_emails else "—"),
        ("Approved By",         ", ".join(approved_emails) if approved_emails else "—"),
        ("Confidence Score",    _safe_str(invoice.confidence_score)),
        ("Original Filename",   _safe_str(invoice.original_filename)),
    ]
    story.append(_kv_table(summary_rows, col_widths=[5.5 * cm, 12.5 * cm]))

    # ─────────────────────────────────────────────────────────────────────────
    # SECTION 2 — GL Coding Summary (if available)
    # ─────────────────────────────────────────────────────────────────────────
    if coding:
        story += _section_heading("2.  GL Coding Summary", styles)

        # Header coding
        pass

        # Line items (if present)
        try:
            line_items = json.loads(coding.line_items) if coding.line_items else []
        except Exception:
            line_items = []

        if line_items:
            story.append(Spacer(1, 5))
            story.append(Paragraph(
                "  Line Items",
                ParagraphStyle("li_h", fontSize=9, textColor=PRIMARY,
                               fontName="Helvetica-Bold", spaceBefore=4, spaceAfter=3)
            ))
            li_headers = ["#", "Description", "GL Code", "LOB", "Department", "Amount"]
            li_col_w   = [0.8*cm, 5.5*cm, 2.5*cm, 2.5*cm, 2.5*cm, 2.4*cm]
            li_rows = []
            for idx, item in enumerate(line_items, start=1):
                li_rows.append([
                    str(idx),
                    _truncate(str(item.get("description", "—")), 50),
                    _safe_str(item.get("gl_code")),
                    _safe_str(item.get("lob")),
                    _safe_str(item.get("department_id") or item.get("department")),
                    _safe_str(item.get("amount")),
                ])
            story.append(_data_table(li_headers, li_rows, li_col_w))

    # ─────────────────────────────────────────────────────────────────────────
    # SECTION 3 — Workflow History
    # ─────────────────────────────────────────────────────────────────────────
    sect_num = 3 if coding else 2
    story += _section_heading(f"{sect_num}.  Workflow History", styles)

    if workflow_steps:
        wf_headers = ["#", "Step Name", "Type", "Actioned By", "Status", "Timestamp", "Comment"]
        wf_col_w   = [0.8*cm, 3.5*cm, 2.5*cm, 3*cm, 2.2*cm, 3.5*cm, 2.7*cm]
        wf_rows = []
        for i, step in enumerate(workflow_steps, start=1):
            wf_rows.append([
                str(i),
                _safe_str(step.step_name),
                _safe_str(step.step_type).replace("_", " ").title(),
                _safe_str(step.user),
                _safe_str(step.status).title(),
                _fmt_dt(step.timestamp),
                _truncate(_safe_str(step.comment, ""), 30),
            ])
        story.append(_data_table(wf_headers, wf_rows, wf_col_w, status_col=4))
    else:
        story.append(Paragraph(
            "  No workflow steps recorded.",
            ParagraphStyle("nodata", fontSize=8.5, textColor=colors.grey, fontName="Helvetica-Oblique")
        ))

    # ─────────────────────────────────────────────────────────────────────────
    # SECTION 4 — Audit Trail
    # ─────────────────────────────────────────────────────────────────────────
    sect_num += 1
    story.append(Spacer(1, 4))
    story += _section_heading(f"{sect_num}.  Audit Trail", styles)

    if audit_logs:
        at_headers = ["#", "Action", "Performed By", "Entity", "Timestamp"]
        at_col_w   = [0.8*cm, 4.5*cm, 3*cm, 2.5*cm, 3.5*cm, 4*cm]
        at_rows = []
        for i, log in enumerate(audit_logs, start=1):
            # Flatten details JSON into a short string
            details_str = ""
            try:
                if log.details:
                    d = json.loads(log.details) if isinstance(log.details, str) else log.details
                    # Extract the most meaningful sub-fields
                    parts = []
                    if isinstance(d, dict):
                        for k, v in d.items():
                            if isinstance(v, dict):
                                sub = ", ".join(f"{sk}: {sv}" for sk, sv in v.items() if sv is not None)
                                parts.append(sub)
                            elif v is not None:
                                parts.append(f"{k}: {v}")
                    else:
                        parts.append(str(d))
                    details_str = "; ".join(parts)
            except Exception as e:
                logger.warning(f"[PDFService] Error parsing audit log details for log {log.id}: {e}")
                details_str = str(log.details or "")

            at_rows.append([
                str(i),
                _safe_str(log.action),
                _safe_str(log.user),
                _safe_str(log.entity),
                _fmt_dt(log.timestamp),
                # Paragraph(_safe_str(details_str), ParagraphStyle("td_wrap", fontSize=7.5, fontName="Helvetica", leading=10)),
            ])
        story.append(_data_table(at_headers, at_rows, at_col_w))
    else:
        story.append(Paragraph(
            "  No audit log entries found.",
            ParagraphStyle("nodata", fontSize=8.5, textColor=colors.grey, fontName="Helvetica-Oblique")
        ))

    # ─────────────────────────────────────────────────────────────────────────
    # SECTION 5 — Final Approval Sign-Off Block
    # ─────────────────────────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1, color=SECONDARY))
    story.append(Spacer(1, 6))

    signoff_style = ParagraphStyle(
        "SignOff", fontSize=9, textColor=BLACK, fontName="Helvetica", leading=14
    )
    signoff_bold = ParagraphStyle(
        "SignOffB", fontSize=9, textColor=SUCCESS, fontName="Helvetica-Bold", leading=14
    )
    story.append(Paragraph("<b>Final Approval Summary</b>", ParagraphStyle(
        "sfh", fontSize=10, textColor=PRIMARY, fontName="Helvetica-Bold", spaceAfter=4
    )))

    signoff_rows = [
        [Paragraph("<b>Invoice</b>", signoff_style),  Paragraph(invoice_ref, signoff_style),
         Paragraph("<b>Entity</b>", signoff_style),   Paragraph(_safe_str(invoice.entity), signoff_style)],
        [Paragraph("<b>Vendor</b>", signoff_style),   Paragraph(_safe_str(invoice.vendor_name), signoff_style),
         Paragraph("<b>Amount</b>", signoff_style),   Paragraph(amount_str, signoff_style)],
        [Paragraph("<b>Approved By</b>", signoff_style),
         Paragraph(", ".join(approved_emails) if approved_emails else "—", signoff_bold),
         Paragraph("<b>Report Date</b>", signoff_style),
         Paragraph((datetime.utcnow() + timedelta(hours=5, minutes=30)).strftime("%d %b %Y"), signoff_style)],
    ]

    so_tbl = Table(signoff_rows, colWidths=[3*cm, 6*cm, 3*cm, 6*cm])
    so_tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, -1), LIGHT_BG),
        ("BOX",          (0, 0), (-1, -1), 0.8, SECONDARY),
        ("INNERGRID",    (0, 0), (-1, -1), 0.3, colors.HexColor("#cbd5e0")),
        ("TOPPADDING",   (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 5),
        ("LEFTPADDING",  (0, 0), (-1, -1), 6),
    ]))
    story.append(so_tbl)

    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "This document was automatically generated upon final approval of the above invoice. "
        "It serves as an official record of the approval workflow and audit trail. "
        "<b>No physical signature is required.</b>",
        ParagraphStyle("disc", fontSize=7.5, textColor=colors.grey, fontName="Helvetica-Oblique", leading=11)
    ))

    # ── 5. Build (render) the PDF ─────────────────────────────────────────────
    doc.build(story, onFirstPage=_page_template, onLaterPages=_page_template)

    print(f"[PDFService] Approval PDF saved → {pdf_path}")
    return str(pdf_path)

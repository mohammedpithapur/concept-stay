"""Operator edit -> admin approval -> published workflow for experiences."""
from app.models.experience import Experience


def apply_pending_changes(exp: Experience) -> Experience:
    """Write exp.pending_changes onto the live row and clear them. Caller commits."""
    for key, value in dict(exp.pending_changes or {}).items():
        setattr(exp, key, value)
    exp.pending_changes = None
    return exp


def approve_experience(exp: Experience) -> Experience:
    apply_pending_changes(exp)
    if exp.approval_status != "approved":
        exp.is_published = True  # first approval publishes; an approved edit never re-publishes a hidden listing
    exp.approval_status = "approved"
    exp.rejection_reason = None
    return exp


def reject_experience(exp: Experience, reason: str) -> Experience:
    """Rejecting an edit to a live listing keeps it live; rejecting a new listing keeps it hidden."""
    exp.pending_changes = None
    exp.rejection_reason = reason
    exp.approval_status = "approved" if exp.approval_status == "approved" else "rejected"
    return exp

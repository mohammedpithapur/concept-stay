"""guest ID documents and refund disputes

Revision ID: 20261021_02_guest_ids_disputes
Revises: 20261021_01_host_profile
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20261021_02_guest_ids_disputes'
down_revision = '20261021_01_host_profile'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('bookings', sa.Column('guest_id_status', sa.String(20), nullable=False, server_default='missing'))
    op.create_table(
        'guest_id_documents',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('booking_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('bookings.id', ondelete='CASCADE'), nullable=False),
        sa.Column('guest_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('doc_type', sa.String(30), nullable=False),
        sa.Column('storage_path', sa.Text(), nullable=False),
        sa.Column('filename', sa.String(255), nullable=False),
        sa.Column('mime', sa.String(100), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('rejection_reason', sa.Text(), nullable=True),
        sa.Column('uploaded_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('booking_id', name='uq_guest_id_documents_booking_id'),
    )
    op.create_table(
        'refund_disputes',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('booking_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('bookings.id', ondelete='CASCADE'), nullable=False),
        sa.Column('opened_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='open'),
        sa.Column('admin_note', sa.Text(), nullable=True),
        sa.Column('decided_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('decided_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_refund_disputes_status', 'refund_disputes', ['status'])
    op.create_index(
        'uq_refund_disputes_open_booking', 'refund_disputes', ['booking_id'],
        unique=True, postgresql_where=sa.text("status = 'open'"),
    )


def downgrade() -> None:
    op.drop_index('uq_refund_disputes_open_booking', table_name='refund_disputes')
    op.drop_index('ix_refund_disputes_status', table_name='refund_disputes')
    op.drop_table('refund_disputes')
    op.drop_table('guest_id_documents')
    op.drop_column('bookings', 'guest_id_status')

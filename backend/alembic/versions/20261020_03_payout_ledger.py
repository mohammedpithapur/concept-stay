"""booking price breakdown columns and payout ledger

Revision ID: 20261020_03_payout_ledger
Revises: 20261020_02_listing_fields
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20261020_03_payout_ledger'
down_revision = '20261020_02_listing_fields'
branch_labels = None
depends_on = None


def upgrade() -> None:
    for col in ('extra_guest_charge', 'taxes', 'service_fee', 'refund_amount'):
        op.add_column('bookings', sa.Column(col, sa.Integer(), server_default='0', nullable=False))
    op.create_table(
        'payouts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('booking_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('bookings.id', ondelete='CASCADE'), nullable=False),
        sa.Column('host_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('gross_amount', sa.Integer(), nullable=False),
        sa.Column('commission', sa.Integer(), nullable=False),
        sa.Column('fees', sa.Integer(), nullable=False),
        sa.Column('taxes', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('host_amount', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='owed'),
        sa.Column('paid_at', sa.DateTime(), nullable=True),
        sa.Column('reference', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('booking_id', name='uq_payouts_booking_id'),
    )
    op.create_index('ix_payouts_host_id', 'payouts', ['host_id'])
    op.create_index('ix_payouts_status', 'payouts', ['status'])


def downgrade() -> None:
    op.drop_table('payouts')
    for col in ('refund_amount', 'service_fee', 'taxes', 'extra_guest_charge'):
        op.drop_column('bookings', col)

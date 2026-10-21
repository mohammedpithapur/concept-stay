"""join-in: opt-in flag on users and the connections table

Revision ID: 20261021_03_join_in
Revises: 20261021_02_guest_ids_disputes
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20261021_03_join_in'
down_revision = '20261021_02_guest_ids_disputes'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('open_to_connections', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table(
        'connections',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('requester_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('addressee_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('property_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('properties.id'), nullable=False),
        sa.Column('booking_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('bookings.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('responded_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('requester_id', 'addressee_id', name='uq_connections_pair'),
    )
    op.create_index('ix_connections_addressee_id', 'connections', ['addressee_id'])


def downgrade() -> None:
    op.drop_index('ix_connections_addressee_id', table_name='connections')
    op.drop_table('connections')
    op.drop_column('users', 'open_to_connections')

"""multi-currency bookings and exchange rates

Revision ID: 20261021_04_currency
Revises: 20261021_03_join_in
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20261021_04_currency'
down_revision = '20261021_03_join_in'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'fx_rates',
        sa.Column('currency', sa.String(3), primary_key=True),
        sa.Column('rate_per_inr', sa.Numeric(18, 8), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=True),
    )
    op.add_column('bookings', sa.Column('currency', sa.String(3), nullable=False, server_default='INR'))
    op.add_column('bookings', sa.Column('fx_rate', sa.Numeric(18, 8), nullable=False, server_default='1'))
    op.add_column('bookings', sa.Column('charged_minor', sa.Integer(), nullable=False, server_default='0'))
    # existing bookings were all charged in rupees: backfill the minor-unit amount (paise)
    op.execute("UPDATE bookings SET charged_minor = total * 100")


def downgrade() -> None:
    op.drop_column('bookings', 'charged_minor')
    op.drop_column('bookings', 'fx_rate')
    op.drop_column('bookings', 'currency')
    op.drop_table('fx_rates')

"""local experiences marketplace: operator role, experiences, slots, bookings, payments, payouts, reviews, settings

Revision ID: 20261022_01_experiences
Revises: 20261021_04_currency
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20261022_01_experiences'
down_revision = '20261021_04_currency'
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'operator'")
    operator_status = sa.Enum('pending', 'approved', 'suspended', name='operatorstatus')
    operator_status.create(op.get_bind(), checkfirst=True)
    op.add_column(
        'users',
        sa.Column('operator_status', sa.Enum('pending', 'approved', 'suspended', name='operatorstatus', create_type=False),
                  server_default='approved', nullable=False),
    )

    op.create_table(
        'app_settings',
        sa.Column('key', sa.String(100), primary_key=True),
        sa.Column('value', sa.String(500), nullable=False),
    )

    op.create_table(
        'experiences',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('operator_id', UUID, sa.ForeignKey('users.id'), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('description', sa.Text(), nullable=False, server_default=''),
        sa.Column('images', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('city', sa.String(100), nullable=False),
        sa.Column('state', sa.String(100), nullable=False),
        sa.Column('meeting_point', sa.Text(), nullable=False, server_default=''),
        sa.Column('category', sa.String(30), nullable=False),
        sa.Column('duration_minutes', sa.Integer(), nullable=False),
        sa.Column('difficulty', sa.String(10), nullable=False, server_default='easy'),
        sa.Column('min_age', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('languages', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('included', sa.Text(), nullable=False, server_default=''),
        sa.Column('what_to_bring', sa.Text(), nullable=False, server_default=''),
        sa.Column('price_per_person', sa.Integer(), nullable=False),
        sa.Column('approval_status', sa.String(20), nullable=False, server_default='pending_review'),
        sa.Column('pending_changes', postgresql.JSONB(), nullable=True),
        sa.Column('rejection_reason', sa.Text(), nullable=True),
        sa.Column('is_published', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('avg_rating', sa.Numeric(3, 1), nullable=False, server_default='0'),
        sa.Column('review_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint('price_per_person > 0', name='ck_experiences_price_positive'),
    )
    op.create_index('ix_experiences_operator_id', 'experiences', ['operator_id'])
    op.create_index('ix_experiences_city', 'experiences', ['city'])
    op.create_index('ix_experiences_category', 'experiences', ['category'])
    op.create_index('ix_experiences_published', 'experiences', ['is_published', 'approval_status'])

    op.create_table(
        'experience_slots',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('experience_id', UUID, sa.ForeignKey('experiences.id', ondelete='CASCADE'), nullable=False),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('capacity', sa.Integer(), nullable=False),
        sa.Column('seats_booked', sa.Integer(), nullable=False, server_default='0'),
        sa.CheckConstraint('capacity >= 1', name='ck_experience_slots_capacity'),
        sa.CheckConstraint('seats_booked >= 0 AND seats_booked <= capacity', name='ck_experience_slots_seats'),
    )
    op.create_index('ix_experience_slots_experience_start', 'experience_slots', ['experience_id', 'starts_at'])

    op.create_table(
        'experience_bookings',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('experience_id', UUID, sa.ForeignKey('experiences.id'), nullable=False),
        sa.Column('slot_id', UUID, sa.ForeignKey('experience_slots.id'), nullable=False),
        sa.Column('guest_id', UUID, sa.ForeignKey('users.id'), nullable=False),
        sa.Column('party_size', sa.Integer(), nullable=False),
        sa.Column('price_per_person', sa.Integer(), nullable=False),
        sa.Column('value', sa.Integer(), nullable=False),
        sa.Column('service_fee', sa.Integer(), nullable=False),
        sa.Column('taxes', sa.Integer(), nullable=False),
        sa.Column('total', sa.Integer(), nullable=False),
        sa.Column('commission_percent', sa.Integer(), nullable=False),
        sa.Column('commission', sa.Integer(), nullable=False),
        sa.Column('currency', sa.String(3), nullable=False, server_default='INR'),
        sa.Column('fx_rate', sa.Numeric(18, 8), nullable=False, server_default='1'),
        sa.Column('charged_minor', sa.Integer(), nullable=False),
        sa.Column('voucher_code', sa.String(12), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint('party_size >= 1', name='ck_experience_bookings_party'),
        sa.UniqueConstraint('voucher_code', name='uq_experience_bookings_voucher'),
    )
    op.create_index('ix_experience_bookings_guest_id', 'experience_bookings', ['guest_id'])
    op.create_index('ix_experience_bookings_slot_id', 'experience_bookings', ['slot_id'])
    op.create_index('ix_experience_bookings_status', 'experience_bookings', ['status'])

    op.create_table(
        'experience_payments',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('booking_id', UUID, sa.ForeignKey('experience_bookings.id', ondelete='CASCADE'), nullable=False),
        sa.Column('razorpay_order_id', sa.String(100), nullable=False),
        sa.Column('razorpay_payment_id', sa.String(100), nullable=True),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('currency', sa.String(3), nullable=False, server_default='INR'),
        sa.Column('status', sa.String(20), nullable=False, server_default='created'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('booking_id', name='uq_experience_payments_booking_id'),
        sa.UniqueConstraint('razorpay_order_id', name='uq_experience_payments_order_id'),
    )

    op.create_table(
        'experience_payouts',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('booking_id', UUID, sa.ForeignKey('experience_bookings.id', ondelete='CASCADE'), nullable=False),
        sa.Column('operator_id', UUID, sa.ForeignKey('users.id'), nullable=False),
        sa.Column('gross_amount', sa.Integer(), nullable=False),
        sa.Column('commission', sa.Integer(), nullable=False),
        sa.Column('fees', sa.Integer(), nullable=False),
        sa.Column('taxes', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('operator_amount', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='owed'),
        sa.Column('paid_at', sa.DateTime(), nullable=True),
        sa.Column('reference', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('booking_id', name='uq_experience_payouts_booking_id'),
    )
    op.create_index('ix_experience_payouts_operator_id', 'experience_payouts', ['operator_id'])
    op.create_index('ix_experience_payouts_status', 'experience_payouts', ['status'])

    op.create_table(
        'experience_reviews',
        sa.Column('id', UUID, primary_key=True),
        sa.Column('booking_id', UUID, sa.ForeignKey('experience_bookings.id', ondelete='CASCADE'), nullable=False),
        sa.Column('guest_id', UUID, sa.ForeignKey('users.id'), nullable=False),
        sa.Column('experience_id', UUID, sa.ForeignKey('experiences.id'), nullable=False),
        sa.Column('rating', sa.Integer(), nullable=False),
        sa.Column('text', sa.Text(), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('booking_id', name='uq_experience_reviews_booking_id'),
        sa.CheckConstraint('rating >= 1 AND rating <= 5', name='ck_experience_reviews_rating'),
    )
    op.create_index('ix_experience_reviews_experience_id', 'experience_reviews', ['experience_id'])


def downgrade() -> None:
    op.drop_table('experience_reviews')
    op.drop_table('experience_payouts')
    op.drop_table('experience_payments')
    op.drop_table('experience_bookings')
    op.drop_table('experience_slots')
    op.drop_table('experiences')
    op.drop_table('app_settings')
    op.drop_column('users', 'operator_status')
    sa.Enum(name='operatorstatus').drop(op.get_bind(), checkfirst=True)
    # The 'operator' value stays in the userrole enum: Postgres cannot remove an enum value.

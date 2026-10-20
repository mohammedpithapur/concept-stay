"""host KYC profile and documents

Revision ID: 20261021_01_host_profile
Revises: 20261020_04_review_categories
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '20261021_01_host_profile'
down_revision = '20261020_04_review_categories'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'host_profiles',
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('legal_name', sa.String(200), nullable=True),
        sa.Column('phone', sa.String(30), nullable=True),
        sa.Column('pan_enc', sa.Text(), nullable=True),
        sa.Column('aadhaar_last4', sa.String(4), nullable=True),
        sa.Column('gst_number', sa.String(20), nullable=True),
        sa.Column('bank_holder', sa.String(200), nullable=True),
        sa.Column('bank_account_enc', sa.Text(), nullable=True),
        sa.Column('bank_ifsc', sa.String(11), nullable=True),
        sa.Column('kyc_status', sa.String(20), nullable=False, server_default='incomplete'),
        sa.Column('rejection_reason', sa.Text(), nullable=True),
        sa.Column('submitted_at', sa.DateTime(), nullable=True),
        sa.Column('verified_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        'host_documents',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('doc_type', sa.String(30), nullable=False),
        sa.Column('storage_path', sa.Text(), nullable=False),
        sa.Column('filename', sa.String(255), nullable=False),
        sa.Column('mime', sa.String(100), nullable=False),
        sa.Column('size', sa.Integer(), nullable=False),
        sa.Column('uploaded_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_host_documents_user_id', 'host_documents', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_host_documents_user_id', table_name='host_documents')
    op.drop_table('host_documents')
    op.drop_table('host_profiles')
